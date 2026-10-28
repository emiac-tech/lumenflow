from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import fitz
import requests
from openai import OpenAI
from PIL import Image


BASE_DIR = Path(__file__).resolve().parent
TEMP_ROOT = BASE_DIR / "data" / "temp"
TEMP_ROOT.mkdir(parents=True, exist_ok=True)

EXTRACTION_CACHE_ROOT = BASE_DIR / "data" / "extraction_cache"
EXTRACTION_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
EXTRACTION_CACHE_SCHEMA = os.getenv("PDF_EXTRACTION_CACHE_VERSION", "v2-fast-path")
EXTRACTION_CACHE_ENABLED = os.getenv("PDF_EXTRACTION_CACHE_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}

EXTERNAL_EXTRACTOR_URL = os.getenv("PDF_PRODUCT_EXTRACTOR_URL", "http://72.61.203.94:8765/api/extract")
EXTERNAL_SCHEDULE_EXTRACTOR_URL = os.getenv("PDF_SCHEDULE_EXTRACTOR_URL", "http://72.61.203.94:8766/api/extract")
EXTERNAL_EXTRACTOR_API_KEY = os.getenv("PDF_PRODUCT_EXTRACTOR_API_KEY", "")
EXTERNAL_EXTRACTOR_MODEL = os.getenv("PDF_PRODUCT_EXTRACTOR_MODEL", "gpt-4o-mini")
EXTERNAL_EXTRACTOR_MODE = os.getenv("PDF_PRODUCT_EXTRACTOR_MODE", "auto")
EXTERNAL_EXTRACTOR_TIMEOUT = int(os.getenv("PDF_PRODUCT_EXTRACTOR_TIMEOUT", "240"))
FAST_PATH_MAX_PAGES = max(0, int(os.getenv("PDF_FAST_PATH_MAX_PAGES", "5")))



def extraction_cache_identity(
    pdf_path: str,
    custom_columns: list[dict] | None,
) -> tuple[str, str]:
    digest = hashlib.sha256()
    with open(pdf_path, "rb") as pdf_file:
        for chunk in iter(lambda: pdf_file.read(1024 * 1024), b""):
            digest.update(chunk)
    document_sha256 = digest.hexdigest()
    context = {
        "schema": EXTRACTION_CACHE_SCHEMA,
        "schedule_url": EXTERNAL_SCHEDULE_EXTRACTOR_URL,
        "model": EXTERNAL_EXTRACTOR_MODEL,
        "mode": EXTERNAL_EXTRACTOR_MODE,
        "custom_columns": custom_columns or [],
    }
    context_json = json.dumps(
        context,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    cache_key = hashlib.sha256(
        f"{document_sha256}:{context_json}".encode("utf-8")
    ).hexdigest()
    return document_sha256, cache_key


def restore_cached_extraction(
    cache_key: str,
    work_dir: Path,
) -> dict | None:
    entry_dir = EXTRACTION_CACHE_ROOT / cache_key
    manifest_path = entry_dir / "result.json"
    if not manifest_path.is_file():
        return None

    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    if payload.get("schema") != EXTRACTION_CACHE_SCHEMA:
        return None

    result = {
        "metadata": payload.get("metadata", {}),
        "custom_fields": payload.get("custom_fields", {}),
    }
    for field_name in (
        "product_image_path",
        "diagram_image_path",
        "polar_image_path",
    ):
        cached_name = payload.get(field_name)
        if not cached_name:
            result[field_name] = None
            continue
        cached_path = entry_dir / cached_name
        if not cached_path.is_file():
            return None
        restored_path = work_dir / cached_name
        shutil.copy2(cached_path, restored_path)
        result[field_name] = str(restored_path)
    return result


def store_cached_extraction(
    cache_key: str,
    document_sha256: str,
    result: dict,
) -> None:
    entry_dir = EXTRACTION_CACHE_ROOT / cache_key
    entry_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": EXTRACTION_CACHE_SCHEMA,
        "document_sha256": document_sha256,
        "metadata": result.get("metadata", {}),
        "custom_fields": result.get("custom_fields", {}),
    }

    asset_fields = {
        "product_image_path": "product",
        "diagram_image_path": "diagram",
        "polar_image_path": "polar",
    }
    for field_name, asset_name in asset_fields.items():
        source_value = result.get(field_name)
        source_path = Path(source_value) if source_value else None
        if not source_path or not source_path.is_file():
            payload[field_name] = None
            continue
        suffix = source_path.suffix.lower() or ".bin"
        cached_name = f"{asset_name}{suffix}"
        temporary_path = entry_dir / f".{cached_name}.{uuid.uuid4().hex}.tmp"
        shutil.copy2(source_path, temporary_path)
        os.replace(temporary_path, entry_dir / cached_name)
        payload[field_name] = cached_name

    manifest_path = entry_dir / "result.json"
    temporary_manifest = entry_dir / f".result.{uuid.uuid4().hex}.tmp"
    temporary_manifest.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    os.replace(temporary_manifest, manifest_path)


def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def extension_for_mime(mime_type: str | None) -> str:
    normalized = (mime_type or "").split(";")[0].strip().lower()
    if normalized in {"image/jpeg", "image/jpg"}:
        return ".jpg"
    if normalized == "image/png":
        return ".png"
    if normalized == "image/webp":
        return ".webp"
    return ".png"


def safe_json_loads(raw_text: str) -> dict:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        cleaned = cleaned.replace("json", "", 1).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        raise ValueError(f"Could not parse JSON from model response: {raw_text}")
    return json.loads(match.group(0))


def extract_pdf_text(pdf_document: fitz.Document, max_chars: int = 12000) -> str:
    chunks = []
    for page_index, page in enumerate(pdf_document):
        text = page.get_text("text").strip()
        if text:
            chunks.append(f"[Page {page_index + 1}]\n{text}")
    combined = "\n\n".join(chunks)
    return combined[:max_chars]


def extract_candidate_images(pdf_document: fitz.Document, temp_dir: Path) -> list[str]:
    return [
        candidate["path"]
        for candidate in extract_asset_candidates(pdf_document, temp_dir)
        if candidate["width"] >= 240 and candidate["height"] >= 240
    ]


def image_structure_metrics(image_path: str) -> dict[str, float]:
    with Image.open(image_path) as source:
        rgb = source.convert("RGB")
        original_width, original_height = rgb.size
        rgb.thumbnail((256, 256))
        gray = rgb.convert("L")

    width, height = gray.size
    pixels = gray.tobytes()
    total = max(1, len(pixels))
    white_ratio = sum(value > 245 for value in pixels) / total
    ink_ratio = sum(value < 230 for value in pixels) / total
    dark_ratio = sum(value < 128 for value in pixels) / total

    dense_rows = sum(
        sum(value < 230 for value in pixels[y * width : (y + 1) * width])
        > width * 0.5
        for y in range(height)
    ) / max(1, height)
    transposed = gray.transpose(Image.Transpose.ROTATE_90)
    transposed_pixels = transposed.tobytes()
    transposed_width, transposed_height = transposed.size
    dense_columns = sum(
        sum(
            value < 230
            for value in transposed_pixels[
                y * transposed_width : (y + 1) * transposed_width
            ]
        )
        > transposed_width * 0.5
        for y in range(transposed_height)
    ) / max(1, transposed_height)

    return {
        "width": float(original_width),
        "height": float(original_height),
        "aspect": original_width / max(1, original_height),
        "white": white_ratio,
        "ink": ink_ratio,
        "dark": dark_ratio,
        "dense_rows": dense_rows,
        "dense_columns": dense_columns,
    }


def nearby_image_context(page: fitz.Page, rect: fitz.Rect) -> str:
    expanded = fitz.Rect(
        max(0, rect.x0 - 30),
        max(0, rect.y0 - 45),
        min(page.rect.width, rect.x1 + 30),
        min(page.rect.height, rect.y1 + 45),
    )
    chunks = []
    for block in page.get_text("blocks"):
        block_rect = fitz.Rect(block[:4])
        text = str(block[4] or "").strip()
        if text and expanded.intersects(block_rect):
            chunks.append(text.replace("\n", " "))
    return " | ".join(chunks)[:300]


def extract_asset_candidates(
    pdf_document: fitz.Document,
    temp_dir: Path,
) -> list[dict]:
    candidates = []
    seen = set()
    for page_num in range(len(pdf_document)):
        page = pdf_document[page_num]
        image_list = page.get_images(full=True)

        for img_index, img in enumerate(image_list):
            xref = img[0]
            if (page_num, xref) in seen:
                continue
            seen.add((page_num, xref))
            base_image = pdf_document.extract_image(xref)
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            width = int(base_image.get("width", 0))
            height = int(base_image.get("height", 0))

            if width < 180 or height < 180:
                continue

            image_filename = f"page{page_num + 1}_img{img_index + 1}_{width}x{height}.{image_ext}"
            temp_filepath = temp_dir / image_filename
            temp_filepath.write_bytes(image_bytes)
            rects = page.get_image_rects(xref)
            rect = rects[0] if rects else fitz.Rect()
            candidates.append(
                {
                    "id": f"p{page_num + 1}_i{img_index + 1}",
                    "path": str(temp_filepath),
                    "page": page_num + 1,
                    "index": img_index + 1,
                    "width": width,
                    "height": height,
                    "rect": (
                        float(rect.x0),
                        float(rect.y0),
                        float(rect.x1),
                        float(rect.y1),
                    ),
                    "context": nearby_image_context(page, rect),
                    "metrics": image_structure_metrics(str(temp_filepath)),
                    "source": "embedded",
                }
            )

    return candidates


def is_erco_product_sheet(pdf_text: str) -> bool:
    normalized = re.sub(r"\s+", " ", pdf_text.lower())
    return (
        "erco" in normalized
        and "product description" in normalized
        and "technical data" in normalized
        and "beam angle" in normalized
    )


def render_page_clip_candidate(
    page: fitz.Page,
    clip: fitz.Rect,
    temp_dir: Path,
    candidate_id: str,
    context: str,
) -> dict:
    padded_clip = fitz.Rect(
        max(0, clip.x0 - 5),
        max(0, clip.y0 - 5),
        min(page.rect.width, clip.x1 + 5),
        min(page.rect.height, clip.y1 + 5),
    )
    output_path = temp_dir / f"{candidate_id}.png"
    pixmap = page.get_pixmap(
        matrix=fitz.Matrix(3, 3),
        clip=padded_clip,
        alpha=False,
    )
    pixmap.save(str(output_path))
    metrics = image_structure_metrics(str(output_path))
    return {
        "id": candidate_id,
        "path": str(output_path),
        "page": page.number + 1,
        "index": 0,
        "width": int(metrics["width"]),
        "height": int(metrics["height"]),
        "rect": (
            float(padded_clip.x0),
            float(padded_clip.y0),
            float(padded_clip.x1),
            float(padded_clip.y1),
        ),
        "context": context,
        "metrics": metrics,
        "source": "deterministic_erco_vector",
    }


def extract_erco_vector_asset_candidates(
    pdf_document: fitz.Document,
    pdf_text: str,
    temp_dir: Path,
) -> list[dict]:
    """Render ERCO vector drawings that are not embedded PDF images."""
    if not is_erco_product_sheet(pdf_text) or not pdf_document:
        return []

    page = pdf_document[0]
    page_width = float(page.rect.width)
    page_height = float(page.rect.height)
    drawing_rects = [
        fitz.Rect(drawing["rect"])
        for drawing in page.get_drawings()
        if drawing.get("rect")
    ]

    diagram_options = [
        rect
        for rect in drawing_rects
        if (
            rect.x0 >= page_width * 0.45
            and rect.y0 <= page_height * 0.30
            and rect.width >= page_width * 0.30
            and rect.height >= page_height * 0.08
            and rect.width / max(1, rect.height) >= 1.45
        )
    ]
    diagram_rect = min(
        diagram_options,
        key=lambda rect: (rect.y0, -rect.width * rect.height),
        default=None,
    )

    polar_text_rects = []
    for block in page.get_text("blocks"):
        text = " ".join(str(block[4] or "").split())
        if re.search(r"\bI\s*max\b|\b\d{3,}\s*cd\b", text, re.IGNORECASE):
            polar_text_rects.append(fitz.Rect(block[:4]))

    polar_options = [
        rect
        for rect in drawing_rects
        if (
            rect.x0 >= page_width * 0.45
            and page_height * 0.30 <= rect.y0 <= page_height * 0.58
            and page_width * 0.12 <= rect.width <= page_width * 0.32
            and page_height * 0.08 <= rect.height <= page_height * 0.22
            and 0.70 <= rect.width / max(1, rect.height) <= 1.45
        )
    ]

    def polar_score(rect: fitz.Rect) -> tuple[int, float, float]:
        label_hits = sum(
            1 for text_rect in polar_text_rects if rect.intersects(text_rect)
        )
        return (label_hits, rect.width * rect.height, -rect.y0)

    polar_rect = max(polar_options, key=polar_score, default=None)
    if polar_rect and polar_text_rects and polar_score(polar_rect)[0] == 0:
        polar_rect = None

    candidates = []
    if diagram_rect:
        candidates.append(
            render_page_clip_candidate(
                page,
                diagram_rect,
                temp_dir,
                "erco_vector_diagram",
                "ERCO vector dimension drawing with measurement lines and dimensions",
            )
        )
    if polar_rect:
        candidates.append(
            render_page_clip_candidate(
                page,
                polar_rect,
                temp_dir,
                "erco_vector_polar",
                "ERCO vector polar curve with degree and candela labels",
            )
        )
    return candidates


DIMENSION_TEXT_PATTERN = re.compile(
    r"[Øø][ 	]*[0-9]|(?:max|min)\.?[ 	]*[0-9]|"
    r"[0-9]+(?:[.,][0-9]+)?[ 	]*(?:mm|cm|m)(?:[^A-Za-z]|$)|"
    r"(?:width|height|diameter|length|dimensions?)",
    re.IGNORECASE,
)


def extract_vector_dimension_asset_candidates(
    pdf_document: fitz.Document,
    temp_dir: Path,
) -> list[dict]:
    """Render compact vector dimension drawings using nearby dimension labels."""
    candidates: list[dict] = []
    for page in pdf_document:
        blocks = [
            (fitz.Rect(block[:4]), " ".join(str(block[4] or "").split()))
            for block in page.get_text("blocks")
            if str(block[4] or "").strip()
        ]
        strong_blocks = [
            (rect, text)
            for rect, text in blocks
            if DIMENSION_TEXT_PATTERN.search(text)
        ]
        cluster_options: list[tuple[int, int, fitz.Rect, list[str]]] = []
        for anchor_rect, _anchor_text in strong_blocks:
            anchor_center_x = (anchor_rect.x0 + anchor_rect.x1) / 2
            anchor_center_y = (anchor_rect.y0 + anchor_rect.y1) / 2
            nearby = [
                (rect, text)
                for rect, text in blocks
                if (
                    abs(((rect.x0 + rect.x1) / 2) - anchor_center_x) < 130
                    and abs(((rect.y0 + rect.y1) / 2) - anchor_center_y) < 100
                    and (
                        re.search(r"\d", text)
                        or DIMENSION_TEXT_PATTERN.search(text)
                    )
                )
            ]
            if len(nearby) < 2:
                continue
            union = fitz.Rect(nearby[0][0])
            for rect, _text in nearby[1:]:
                union.include_rect(rect)
            strong_hits = sum(
                1 for _rect, text in nearby if DIMENSION_TEXT_PATTERN.search(text)
            )
            if strong_hits >= 2:
                cluster_options.append(
                    (
                        strong_hits,
                        len(nearby),
                        union,
                        [text for _rect, text in nearby],
                    )
                )

        viable_options: list[tuple[int, int, float, float, fitz.Rect, list[str]]] = []
        seen_clips: set[tuple[int, int, int, int]] = set()
        for strong_hits, label_count, label_rect, labels in cluster_options:
            nearby_zone = fitz.Rect(
                max(0, label_rect.x0 - 80),
                max(0, label_rect.y0 - 55),
                min(page.rect.width, label_rect.x1 + 80),
                min(page.rect.height, label_rect.y1 + 55),
            )
            drawing_rects = []
            for drawing in page.get_drawings():
                if not drawing.get("rect"):
                    continue
                rect = fitz.Rect(drawing["rect"])
                if (
                    rect.intersects(nearby_zone)
                    and rect.width < page.rect.width * 0.65
                    and rect.height < page.rect.height * 0.45
                    and rect.width * rect.height > 3
                ):
                    drawing_rects.append(rect)
            if len(drawing_rects) < 2:
                continue

            clip = fitz.Rect(label_rect)
            for rect in drawing_rects:
                clip.include_rect(rect)
            if (
                clip.width < 30
                or clip.height < 20
                or clip.width > page.rect.width * 0.65
                or clip.height > page.rect.height * 0.45
            ):
                continue
            clip_key = tuple(round(value / 5) for value in clip)
            if clip_key in seen_clips:
                continue
            seen_clips.add(clip_key)
            viable_options.append(
                (
                    strong_hits,
                    label_count,
                    -clip.width * clip.height,
                    clip.y0,
                    clip,
                    labels,
                )
            )

        if not viable_options:
            continue
        _hits, _count, _area, _top, clip, labels = max(viable_options)
        candidate = render_page_clip_candidate(
            page,
            clip,
            temp_dir,
            f"p{page.number + 1}_vector_dimension",
            "Vector technical dimension drawing with nearby measurement labels: "
            + " | ".join(labels[:4]),
        )
        candidate["source"] = "deterministic_vector_dimension"
        if is_obvious_table_crop(candidate):
            Path(candidate["path"]).unlink(missing_ok=True)
            continue
        candidates.append(candidate)

    return candidates


def extract_clustered_vector_asset_candidates(
    pdf_document: fitz.Document,
    temp_dir: Path,
    max_pages: int = 2,
    max_per_page: int = 3,
) -> list[dict]:
    """Render compact vector clusters such as outlined dimension drawings."""
    candidates: list[dict] = []
    for page in list(pdf_document)[:max_pages]:
        drawing_rects = []
        for drawing in page.get_drawings():
            if not drawing.get("rect"):
                continue
            rect = fitz.Rect(drawing["rect"])
            area = rect.width * rect.height
            if (
                area <= 2
                or area > 5000
                or rect.width > page.rect.width * 0.45
                or rect.height > page.rect.height * 0.40
                or (
                    min(rect.width, rect.height) < 1.2
                    and max(rect.width, rect.height) > 80
                )
            ):
                continue
            drawing_rects.append(rect)

        pending = list(drawing_rects)
        page_options: list[tuple[int, float, dict]] = []
        while pending:
            group = [pending.pop(0)]
            union = fitz.Rect(group[0])
            changed = True
            while changed:
                changed = False
                nearby_zone = fitz.Rect(
                    union.x0 - 18,
                    union.y0 - 18,
                    union.x1 + 18,
                    union.y1 + 18,
                )
                for rect in pending[:]:
                    if rect.intersects(nearby_zone):
                        group.append(rect)
                        union.include_rect(rect)
                        pending.remove(rect)
                        changed = True

            if (
                len(group) < 6
                or union.width < 30
                or union.height < 15
                or union.width > page.rect.width * 0.45
                or union.height > page.rect.height * 0.35
            ):
                continue
            candidate = render_page_clip_candidate(
                page,
                union,
                temp_dir,
                f"p{page.number + 1}_vector_candidate_{len(page_options) + 1}",
                "Compact vector drawing candidate; accept as diagram or polar only when visible labels and measurement/photometric lines support it",
            )
            metrics = candidate.get("metrics") or {}
            if (
                is_obvious_table_crop(candidate)
                or float(metrics.get("white") or 0) < 0.65
                or not 0.005 <= float(metrics.get("ink") or 0) <= 0.22
            ):
                Path(candidate["path"]).unlink(missing_ok=True)
                continue
            candidate["source"] = "deterministic_vector_cluster"
            page_options.append(
                (
                    len(group),
                    -(union.width * union.height),
                    candidate,
                )
            )

        page_options.sort(reverse=True, key=lambda item: (item[0], item[1]))
        candidates.extend(
            candidate for _count, _area, candidate in page_options[:max_per_page]
        )

    return candidates


def extract_ip_rating_from_pdf_badges(
    pdf_document: fitz.Document,
    temp_dir: Path,
    max_candidates: int = 40,
) -> str:
    """Read raster IP-rating badges locally when they are absent from PDF text.

    Some manufacturer PDFs store IP20/IP43/etc. as tiny embedded images. The
    remote schedule extractor can therefore return an empty value even for the
    same PDF it handled successfully on another run. This fallback is strict:
    it accepts only OCR text matching IP followed by exactly two digits.
    """
    if not shutil.which("tesseract"):
        return ""

    ratings: list[str] = []
    seen_xrefs: set[int] = set()
    processed = 0
    badge_images: list[Image.Image] = []

    for page_num in range(len(pdf_document)):
        page = pdf_document[page_num]
        for img_index, image_info in enumerate(page.get_images(full=True)):
            xref = int(image_info[0])
            if xref in seen_xrefs or processed >= max_candidates:
                continue
            seen_xrefs.add(xref)

            embedded = pdf_document.extract_image(xref)
            width = int(embedded.get("width", 0))
            height = int(embedded.get("height", 0))
            # IP badges are small raster assets. Excluding large artwork keeps
            # this fallback fast and avoids OCR noise from product photographs.
            if not (
                20 <= width <= 320
                and 20 <= height <= 180
                and width * height <= 50_000
            ):
                continue

            processed += 1
            extension = str(embedded.get("ext") or "png").lower()
            image_path = (
                temp_dir
                / f"ip_badge_p{page_num + 1}_i{img_index + 1}_{width}x{height}.{extension}"
            )
            image_path.write_bytes(embedded["image"])

            try:
                with Image.open(image_path) as source:
                    badge_images.append(source.convert("RGB"))
            except OSError:
                continue

    if not badge_images:
        return ""

    # One contact-sheet OCR process is substantially faster than starting
    # Tesseract separately for every small badge image.
    cell_width = 260
    cell_height = 110
    columns = 4
    rows = (len(badge_images) + columns - 1) // columns
    contact_sheet = Image.new(
        "RGB",
        (cell_width * columns, cell_height * rows),
        "white",
    )
    for index, image in enumerate(badge_images):
        scale = min(2.0, 80 / max(1, image.height))
        resized = image.resize(
            (
                max(1, int(image.width * scale)),
                max(1, int(image.height * scale)),
            ),
            Image.Resampling.LANCZOS,
        )
        x = (index % columns) * cell_width + max(
            0,
            (cell_width - resized.width) // 2,
        )
        y = (index // columns) * cell_height + max(
            0,
            (cell_height - resized.height) // 2,
        )
        contact_sheet.paste(resized, (x, y))

    contact_sheet_path = temp_dir / "ip_badges_contact_sheet.png"
    contact_sheet.save(contact_sheet_path)
    try:
        completed = subprocess.run(
            [
                "tesseract",
                str(contact_sheet_path),
                "stdout",
                "--psm",
                "6",
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=8,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""

    for digits in re.findall(
        r"\bIP\s*[-:]?\s*([0-9]{2})\b",
        completed.stdout or "",
        flags=re.I,
    ):
        value = f"IP{digits}"
        if value not in ratings:
            ratings.append(value)

    return " / ".join(ratings)


def external_asset_candidate(
    candidate_id: str,
    image_path: str | None,
) -> dict | None:
    if not image_path or not Path(image_path).exists():
        return None
    metrics = image_structure_metrics(image_path)
    return {
        "id": candidate_id,
        "path": image_path,
        "page": 0,
        "index": 0,
        "width": int(metrics["width"]),
        "height": int(metrics["height"]),
        "rect": (0.0, 0.0, 0.0, 0.0),
        "context": "Crop proposed by the external PDF extractor",
        "metrics": metrics,
        "source": "external",
    }


def is_obvious_table_crop(candidate: dict) -> bool:
    metrics = candidate.get("metrics") or {}
    ink_ratio = float(metrics.get("ink") or 0)
    dense_rows = float(metrics.get("dense_rows") or 0)
    dense_columns = float(metrics.get("dense_columns") or 0)
    return (
        ink_ratio >= 0.25
        and (dense_rows >= 0.18 or dense_columns >= 0.18)
    )


def is_iguzzini_product_sheet(pdf_text: str) -> bool:
    normalized = re.sub(r"\s+", " ", pdf_text.lower())
    return all(
        marker in normalized
        for marker in (
            "design iguzzini",
            "product configuration:",
            "technical description",
            "installation",
        )
    )


POLAR_CONTEXT_PATTERN = re.compile(
    r"\b(?:polar(?:\s+curve)?|photometric(?:\s+distribution)?|"
    r"luminous\s+intensity\s+distribution|light\s+distribution\s+curve)\b",
    re.IGNORECASE,
)


def select_labeled_polar_asset(candidates: list[dict]) -> dict | None:
    labeled_candidates = []
    for candidate in candidates:
        context = str(candidate.get("context") or "")
        metrics = candidate.get("metrics") or {}
        aspect = float(metrics.get("aspect") or 0)
        if (
            POLAR_CONTEXT_PATTERN.search(context)
            and min(candidate.get("width", 0), candidate.get("height", 0)) >= 240
            and 0.65 <= aspect <= 1.55
            and not is_obvious_table_crop(candidate)
        ):
            labeled_candidates.append(candidate)

    return min(
        labeled_candidates,
        key=lambda candidate: (
            0 if re.search(r"\bpolar\b", str(candidate.get("context") or ""), re.IGNORECASE) else 1,
            candidate.get("page", 0),
            float((candidate.get("rect") or (0, 0, 0, 0))[1]),
            -candidate.get("width", 0) * candidate.get("height", 0),
        ),
        default=None,
    )


def select_iguzzini_embedded_assets(
    candidates: list[dict],
) -> tuple[str | None, str | None, str | None]:
    polar = select_labeled_polar_asset(candidates)
    first_page = [
        candidate
        for candidate in candidates
        if candidate.get("source") == "embedded" and candidate.get("page") == 1
    ]
    if not first_page:
        return None, None, polar["path"] if polar else None

    product_options = [
        candidate
        for candidate in first_page
        if min(candidate["width"], candidate["height"]) >= 300
    ]
    if not product_options:
        return None, None, polar["path"] if polar else None
    product = max(
        product_options,
        key=lambda candidate: candidate["width"] * candidate["height"],
    )

    product_top = float(product["rect"][1])
    diagram_options = []
    for candidate in first_page:
        if candidate is product:
            continue
        metrics = candidate["metrics"]
        candidate_top = float(candidate["rect"][1])
        if (
            min(candidate["width"], candidate["height"]) >= 350
            and candidate_top > product_top
            and metrics["white"] >= 0.85
            and 0.006 <= metrics["ink"] <= 0.16
            and metrics["dense_rows"] <= 0.08
            and metrics["dense_columns"] <= 0.08
            and not is_obvious_table_crop(candidate)
        ):
            diagram_options.append(candidate)

    diagram = min(
        diagram_options,
        key=lambda candidate: (
            float(candidate["rect"][1]),
            candidate["index"],
        ),
        default=None,
    )
    return (
        product["path"],
        diagram["path"] if diagram else None,
        polar["path"] if polar else None,
    )


def build_asset_selection_payload(candidates: list[dict]) -> list[dict]:
    content = [
        {
            "type": "text",
            "text": (
                "Select assets from a luminaire product PDF. Return strict JSON only: "
                '{"product_id":"","diagram_id":"","diagram_status":"found|not_present",'
                '"polar_id":"","polar_status":"found|not_present"}. '
                "product_id: select the clearest isolated photo or realistic render of "
                "the physical luminaire. diagram_id: select ONLY a technical dimension "
                "drawing of the physical luminaire that visibly contains measurements, "
                "dimension lines/arrows, sizes, diameters, or installation/cut-out dimensions. "
                "polar_id: select ONLY a polar curve / photometric distribution chart, "
                "normally a circular or semicircular spider-web graph with degree angles, "
                "candela/intensity values, Imax, and one or more distribution curves. "
                "Never use an illuminance/lux grid as the polar image. "
                "Never select a specification/technical-data table, prose, UGR badge, "
                "polar or photometric curve, illuminance/lux grid, wiring schematic, "
                "certification icon, logo, QR code, beam-angle graphic, accessory photo, "
                "or another product render as the diagram. If a candidate does not visibly "
                "meet the relevant definition, use an empty ID and not_present. "
                "Use only the exact candidate IDs supplied."
            ),
        }
    ]
    for candidate in candidates[:20]:
        content.append(
            {
                "type": "text",
                "text": (
                    f"Candidate {candidate['id']} "
                    f"({candidate['width']}x{candidate['height']}, "
                    f"source={candidate['source']}, page={candidate['page'] or 'crop'}). "
                    f"Nearby PDF text: {candidate.get('context') or 'none'}"
                ),
            }
        )
        suffix = Path(candidate["path"]).suffix.lower()
        mime_type = "image/png" if suffix == ".png" else "image/jpeg"
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": (
                        f"data:{mime_type};base64,"
                        f"{encode_image(candidate['path'])}"
                    ),
                    "detail": "low",
                },
            }
        )
    return content


def select_assets_with_llm(
    candidates: list[dict],
    api_key: str,
) -> dict:
    if not candidates:
        return {
            "product_id": "",
            "diagram_id": "",
            "diagram_status": "not_present",
            "polar_id": "",
            "polar_status": "not_present",
        }
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=EXTERNAL_EXTRACTOR_MODEL,
        messages=[
            {
                "role": "user",
                "content": build_asset_selection_payload(candidates),
            }
        ],
        temperature=0,
        max_tokens=220,
        response_format={"type": "json_object"},
    )
    return safe_json_loads(response.choices[0].message.content or "{}")


def select_document_assets(
    embedded_candidates: list[dict],
    pdf_text: str,
    api_key: str,
    external_product_path: str | None,
    external_diagram_path: str | None,
    external_polar_path: str | None,
) -> tuple[str | None, str | None, str | None]:
    if is_erco_product_sheet(pdf_text):
        erco_diagram = next(
            (
                candidate
                for candidate in embedded_candidates
                if candidate.get("id") == "erco_vector_diagram"
            ),
            None,
        )
        erco_polar = next(
            (
                candidate
                for candidate in embedded_candidates
                if candidate.get("id") == "erco_vector_polar"
            ),
            None,
        )
        erco_product = max(
            (
                candidate
                for candidate in embedded_candidates
                if (
                    candidate.get("source") == "embedded"
                    and candidate.get("page") == 1
                )
            ),
            key=lambda candidate: candidate["width"] * candidate["height"],
            default=None,
        )
        if erco_product and erco_diagram and erco_polar:
            print(
                "Asset selection:",
                {
                    "method": "deterministic_erco_vector_layout",
                    "product": erco_product["id"],
                    "diagram": erco_diagram["id"],
                    "polar": erco_polar["id"],
                },
            )
            return (
                erco_product["path"],
                erco_diagram["path"],
                erco_polar["path"],
            )

    labeled_polar = select_labeled_polar_asset(embedded_candidates)
    if is_iguzzini_product_sheet(pdf_text):
        product_path, diagram_path, polar_path = select_iguzzini_embedded_assets(
            embedded_candidates
        )
        if product_path:
            print(
                "Asset selection:",
                {
                    "method": "deterministic_iguzzini_layout",
                    "product": Path(product_path).name,
                    "diagram": Path(diagram_path).name if diagram_path else None,
                    "polar": Path(polar_path).name if polar_path else None,
                },
            )
            return product_path, diagram_path, polar_path

    candidates = list(embedded_candidates)
    external_product = external_asset_candidate(
        "external_product",
        external_product_path,
    )
    external_diagram = external_asset_candidate(
        "external_diagram",
        external_diagram_path,
    )
    external_polar = external_asset_candidate(
        "external_polar",
        external_polar_path,
    )
    if external_product:
        candidates.append(external_product)
    if external_diagram:
        candidates.append(external_diagram)
    if external_polar:
        candidates.append(external_polar)

    by_id = {candidate["id"]: candidate for candidate in candidates}
    try:
        selection = select_assets_with_llm(candidates, api_key)
    except Exception as exc:
        print(
            "Asset selector failed closed:",
            {
                "error": f"{type(exc).__name__}: {exc}",
                "diagram": None,
            },
        )
        return (
            external_product_path,
            None,
            labeled_polar["path"] if labeled_polar else external_polar_path,
        )

    product_candidate = by_id.get(str(selection.get("product_id") or ""))
    diagram_candidate = by_id.get(str(selection.get("diagram_id") or ""))
    polar_candidate = labeled_polar or by_id.get(str(selection.get("polar_id") or ""))
    if diagram_candidate and is_obvious_table_crop(diagram_candidate):
        print(
            "Rejected table-like diagram candidate:",
            {
                "candidate": diagram_candidate["id"],
                "metrics": diagram_candidate["metrics"],
            },
        )
        diagram_candidate = None

    product_path = (
        product_candidate["path"]
        if product_candidate
        else external_product_path
    )
    diagram_path = diagram_candidate["path"] if diagram_candidate else None
    polar_path = polar_candidate["path"] if polar_candidate else external_polar_path
    print(
        "Asset selection:",
        {
            "method": "semantic_candidate_selection",
            "product": (
                product_candidate["id"] if product_candidate else "external_fallback"
            ),
            "diagram": diagram_candidate["id"] if diagram_candidate else None,
            "diagram_status": selection.get("diagram_status"),
            "polar": polar_candidate["id"] if polar_candidate else None,
            "polar_status": (
                "found_labeled"
                if labeled_polar
                else selection.get("polar_status")
            ),
        },
    )
    return product_path, diagram_path, polar_path


def build_llm_payload(candidate_paths: list[str], pdf_text: str, custom_columns: list[dict] | None = None) -> list[dict]:
    custom_columns = custom_columns or []
    custom_instruction = ""
    if custom_columns:
        serialized = json.dumps(custom_columns, ensure_ascii=True)
        custom_instruction = (
            ' Also return a "custom_fields" object keyed by custom column name. '
            "Only include the custom columns provided below, and use empty strings when unknown. "
            f"Custom AI-enabled columns: {serialized}."
        )

    content = [
        {
            "type": "text",
            "text": (
                "You are extracting luminaire schedule details from a PDF. "
                "Identify up to three images from the candidates: "
                "(1) the best product photo showing the physical luminaire, "
                "(2) the best technical/dimension drawing showing measurements, "
                "(3) the polar curve / photometric distribution diagram (a semicircular spider-web chart showing light intensity distribution in candela, typically labelled with degree angles like 0° 30° 60° 90° and candela values like Imax). "
                "Then extract luminaire metadata from the PDF text. "
                "Return strict JSON with this shape only: "
                '{"product_image_filename":"","diagram_image_filename":"","polar_image_filename":"","metadata":{"type":"","manufacturer":"","product":"","spec_code":"","description":"","colour":"","cct":"","cri":"","unit_watts":"","dimming":"","quantity":"","ip_rating":"","total_watts":""},"custom_fields":{}}. '
                f"{custom_instruction}"
                "Use empty strings when a field or image is missing. Prefer concise field values. "
                "Keep ordinary values under 80 characters and description, General Notes, "
                "or Required Accessories under 240 characters."
            ),
        },
        {
            "type": "text",
            "text": f"PDF text excerpt:\n{pdf_text or 'No extractable text found.'}",
        },
    ]

    for filepath in candidate_paths[:12]:
        filename = os.path.basename(filepath)
        ext = filename.split(".")[-1].lower()
        mime_type = "image/png" if ext == "png" else "image/jpeg"
        content.append({"type": "text", "text": f"Candidate filename: {filename}"})
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{encode_image(filepath)}",
                    "detail": "low",
                },
            }
        )

    return content


def extract_with_llm(candidate_paths: list[str], pdf_text: str, api_key: str, custom_columns: list[dict] | None = None) -> dict:
    if not api_key:
        raise ValueError("OpenAI API key is required for document processing.")

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=EXTERNAL_EXTRACTOR_MODEL,
        messages=[{"role": "user", "content": build_llm_payload(candidate_paths, pdf_text, custom_columns=custom_columns)}],
        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=min(1000, max(700, 500 + len(custom_columns or []) * 30)),
    )
    raw_text = response.choices[0].message.content or "{}"
    parsed = safe_json_loads(raw_text)
    parsed.setdefault("metadata", {})
    parsed.setdefault("custom_fields", {})
    return parsed


def build_custom_fields_payload(
    candidate_paths: list[str],
    pdf_text: str,
    custom_columns: list[dict],
) -> list[dict]:
    requested_fields = [
        {
            "name": str(column.get("name") or "").strip(),
            "description": str(column.get("description") or "").strip(),
            "visible": bool(column.get("visible", True)),
        }
        for column in custom_columns
        if str(column.get("name") or "").strip()
    ]

    content = [
        {
            "type": "text",
            "text": (
                "Extract project-defined luminaire fields from this PDF. "
                "Return strict JSON only, with this exact shape: "
                '{"custom_fields":{"Exact Column Name":"value"}}. '
                "Include every requested field using its exact column name. "
                "Use each field description to decide what to extract. "
                "The visible flag only indicates display priority; hidden fields must still be extracted. "
                "Use concise values copied from the document, do not invent unsupported values, "
                "and return an empty string when a value cannot be found. "
                f"Requested fields: {json.dumps(requested_fields, ensure_ascii=True)}."
            ),
        },
        {
            "type": "text",
            "text": f"PDF text excerpt:\n{pdf_text or 'No extractable text found.'}",
        },
    ]

    for filepath in candidate_paths[:6]:
        filename = os.path.basename(filepath)
        ext = filename.rsplit(".", 1)[-1].lower()
        mime_type = "image/png" if ext == "png" else "image/jpeg"
        content.append({"type": "text", "text": f"Candidate image: {filename}"})
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{encode_image(filepath)}",
                    "detail": "high",
                },
            }
        )

    return content


def extract_custom_fields_with_llm(
    candidate_paths: list[str],
    pdf_text: str,
    api_key: str,
    custom_columns: list[dict],
) -> dict:
    if not custom_columns:
        return {"custom_fields": {}}
    if not api_key:
        raise ValueError("OpenAI API key is required for custom-column extraction.")

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=EXTERNAL_EXTRACTOR_MODEL,
        messages=[
            {
                "role": "user",
                "content": build_custom_fields_payload(
                    candidate_paths,
                    pdf_text,
                    custom_columns,
                ),
            }
        ],
        max_tokens=min(2000, max(500, len(custom_columns) * 150)),
    )
    raw_text = response.choices[0].message.content or "{}"
    parsed = safe_json_loads(raw_text)
    raw_fields = parsed.get("custom_fields")
    if not isinstance(raw_fields, dict):
        raise ValueError("Custom-column model response did not contain a custom_fields object.")

    normalized_response = {
        re.sub(r"[^a-z0-9]+", "", str(key).lower()): value
        for key, value in raw_fields.items()
    }
    exact_fields = {}
    for column in custom_columns:
        name = str(column.get("name") or "").strip()
        if not name:
            continue
        value = raw_fields.get(name)
        if value is None:
            value = normalized_response.get(re.sub(r"[^a-z0-9]+", "", name.lower()), "")
        exact_fields[name] = "" if value is None else str(value).strip()

    return {"custom_fields": exact_fields}


def choose_fallback_images(candidate_paths: list[str]) -> tuple[str | None, str | None]:
    if not candidate_paths:
        return None, None
    if len(candidate_paths) == 1:
        return candidate_paths[0], candidate_paths[0]
    return candidate_paths[0], candidate_paths[1]


def match_candidate(candidate_paths: list[str], chosen_filename: str | None) -> str | None:
    if not chosen_filename:
        return None
    normalized = chosen_filename.strip().lower()
    for path in candidate_paths:
        name = os.path.basename(path).lower()
        if normalized == name or normalized in name or name in normalized:
            return path
    return None


def save_external_image(media: dict | str | None, temp_dir: Path, prefix: str) -> str | None:
    if isinstance(media, str):
        media = {"url": media}
    if not isinstance(media, dict):
        return None

    image_bytes = None
    mime_type = media.get("mime_type") or ""
    data_url = media.get("data_url") or ""
    raw_base64 = media.get("base64") or ""

    if data_url.startswith("data:") and "," in data_url:
        header, raw_base64 = data_url.split(",", 1)
        mime_type = mime_type or header.split(";", 1)[0].replace("data:", "")

    if raw_base64:
        try:
            image_bytes = base64.b64decode(raw_base64)
        except Exception:
            image_bytes = None

    if image_bytes is None and media.get("url"):
        response = requests.get(media["url"], timeout=EXTERNAL_EXTRACTOR_TIMEOUT)
        response.raise_for_status()
        image_bytes = response.content
        mime_type = mime_type or response.headers.get("content-type", "")

    if not image_bytes:
        return None

    filename = f"external_{prefix}_{uuid.uuid4().hex}{extension_for_mime(mime_type)}"
    output_path = temp_dir / filename
    output_path.write_bytes(image_bytes)
    return str(output_path)


def format_spec_value(spec: dict) -> str:
    value = str(spec.get("value") or "").strip()
    unit = str(spec.get("unit") or "").strip()
    name = str(spec.get("name") or "").strip()
    if not value or value.lower() in {"n/a", "na", "none", "null"}:
        return ""
    if not unit and re.search(r"(?:\bpower\b|\bwatt(?:age)?\b|\(\s*w\s*\))", name, flags=re.I) and re.fullmatch(r"\d+(?:[.,]\d+)?", value):
        unit = "W"
    return f"{value}{unit}" if unit and not value.lower().endswith(unit.lower()) else value


def find_product_spec_values(product: dict, *names: str) -> list[str]:
    wanted = {re.sub(r"[^a-z0-9]+", "", name.lower()) for name in names}
    values: list[str] = []
    for spec in product.get("specifications") or []:
        if not isinstance(spec, dict):
            continue
        spec_name = re.sub(r"[^a-z0-9]+", "", str(spec.get("name") or "").lower())
        if spec_name in wanted:
            value = format_spec_value(spec)
            if value and value not in values:
                values.append(value)
    return values


def join_spec_options(values: list[str]) -> str:
    return " / ".join(values)


def find_product_spec(product: dict, *names: str) -> str:
    values = find_product_spec_values(product, *names)
    return values[0] if values else ""


def clean_schedule_value(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"", "n/a", "na", "none", "null"}:
        return ""
    return text


DEFAULT_SPECIFICATION_FIELD_ALIASES = {
    "Location": ("Location", "Luminaire Location", "Room Location", "Area"),
    "Light Source": ("Light Source", "Lamp Type", "LED Type", "Lamp Code"),
    "MacAdam / SDCM": ("MacAdam / SDCM", "MacAdam", "SDCM", "MacAdam Step"),
    "Beam / Distribution": ("Beam / Distribution", "Beam", "Beam Angle", "Distribution", "Optic"),
    "Delivered Lumens": ("Delivered Lumens", "Lumens", "Luminous Flux", "System Lumens", "Light Output"),
    "LED Lifetime": ("LED Lifetime", "Lifetime", "Rated Life", "Life Time LED"),
    "Input Voltage": ("Input Voltage", "Voltage", "Supply Voltage", "Voltage [Vin]"),
    "Emergency Provision": ("Emergency Provision", "Emergency", "Emergency Mode"),
    "Dimensions": ("Dimensions", "Dimension", "Size", "Overall Dimensions"),
    "Material": ("Material", "Housing Material", "Body Material", "Construction"),
    "Dimming / Control": ("Dimming / Control", "Control", "Control Protocol", "Dimming Protocol"),
    "IK Rating": ("IK Rating", "IK", "Impact Rating"),
    "Weight": ("Weight", "Weight (Kg)", "Product Weight", "Net Weight"),
    "Operating Temperature": ("Operating Temperature", "Operating Temp.", "Ambient Temperature", "Ta Range"),
    "Required Accessories": ("Required Accessories", "Accessories", "Required Accessory", "Installation Accessories"),
    "General Notes": ("General Notes", "Notes", "Remarks", "Compatibility Notes"),
}


def extract_default_specification_fields_from_text(
    pdf_text: str,
    custom_columns: list[dict] | None = None,
) -> dict:
    """Deterministic label/section fallback for common luminaire datasheet fields."""
    text = str(pdf_text or "")
    normalized_text = re.sub(r"[ \t]+", " ", text)
    compact_text = re.sub(r"\s+", " ", text).strip()

    def label_value(*label_patterns: str) -> str:
        for label_pattern in label_patterns:
            patterns = (
                rf"(?:^|\n)\s*{label_pattern}\s*:?\s*\n\s*([^\n]+)",
                rf"(?:^|\n)\s*{label_pattern}\s*:\s*([^\n]+)",
            )
            for pattern in patterns:
                match = re.search(pattern, normalized_text, flags=re.I | re.M)
                if match:
                    return clean_schedule_value(match.group(1))
        return ""

    extracted: dict[str, str] = {}

    light_source = label_value(r"Lamp\s+code", r"Light\s+source", r"Source\s+type")
    if light_source:
        extracted["Light Source"] = light_source

    macadam = label_value(r"MacAdam\s+Step", r"MacAdam", r"SDCM")
    if macadam:
        extracted["MacAdam / SDCM"] = macadam

    delivered_lumens = label_value(r"lm\s+system", r"Delivered\s+Lumens", r"System\s+Lumens")
    if delivered_lumens:
        extracted["Delivered Lumens"] = (
            delivered_lumens
            if re.search(r"\blm\b", delivered_lumens, flags=re.I)
            else f"{delivered_lumens} lm"
        )

    led_lifetime = label_value(r"Life\s*Time\s+LED\s*1", r"LED\s+Lifetime", r"Rated\s+Life")
    if led_lifetime:
        extracted["LED Lifetime"] = led_lifetime

    voltage = label_value(r"Voltage\s*\[Vin\]", r"Input\s+Voltage", r"Supply\s+Voltage")
    if voltage:
        extracted["Input Voltage"] = (
            voltage
            if re.search(r"\bV(?:AC|DC)?\b", voltage, flags=re.I)
            else f"{voltage} V"
        )

    control = label_value(r"Control", r"Dimming", r"Control\s+Protocol")
    if control:
        extracted["Dimming / Control"] = control

    weight = label_value(r"Weight\s*\(Kg\)", r"Weight", r"Net\s+Weight")
    if weight:
        extracted["Weight"] = (
            weight
            if re.search(r"\b(?:kg|g|lb|oz)\b", weight, flags=re.I)
            else f"{weight} kg"
        )

    operating_temperature = label_value(
        r"Intervallo\s+temperatura\s+ambiente",
        r"Operating\s+Temperature",
        r"Ambient\s+Temperature",
        r"Ta\s+Range",
    )
    if operating_temperature:
        extracted["Operating Temperature"] = operating_temperature.rstrip(".")

    ik_match = re.search(r"\bIK\s*([0-9]{2})\b", text, flags=re.I)
    if ik_match:
        extracted["IK Rating"] = f"IK{ik_match.group(1)}"

    dimension_match = re.search(
        r"\b(?:dimensions?|size)\s*:?\s*"
        r"([0-9]+(?:\.[0-9]+)?\s*(?:mm|cm|m)?\s*[x×]\s*"
        r"[0-9]+(?:\.[0-9]+)?(?:\s*(?:mm|cm|m))?"
        r"(?:\s*[x×]\s*[0-9]+(?:\.[0-9]+)?(?:\s*(?:mm|cm|m))?)?)",
        compact_text,
        flags=re.I,
    )
    if dimension_match:
        extracted["Dimensions"] = re.sub(r"\s+", " ", dimension_match.group(1)).strip()

    beam_match = re.search(
        r"\b([0-9]{1,3}\s*°\s*[A-Za-z][A-Za-z0-9 /-]{0,45}\boptic)\b",
        compact_text,
        flags=re.I,
    )
    if beam_match:
        extracted["Beam / Distribution"] = re.sub(r"\s+", " ", beam_match.group(1)).strip()

    materials = []
    for pattern, label in (
        (r"\baluminium\s+alloy\b", "Aluminium alloy"),
        (r"\baluminum\s+alloy\b", "Aluminium alloy"),
        (r"\bmethacrylate\b", "Methacrylate optic screen"),
        (r"\bA2\s+stainless\s+steel\b", "A2 stainless steel screws"),
        (r"\bpolycarbonate\b", "Polycarbonate"),
        (r"\bcast\s+aluminium\b", "Cast aluminium"),
        (r"\bextruded\s+aluminium\b", "Extruded aluminium"),
    ):
        if re.search(pattern, compact_text, flags=re.I) and label not in materials:
            materials.append(label)
    if materials:
        extracted["Material"] = "; ".join(materials)

    accessory_sentences = []
    for sentence in re.split(r"(?<=[.!?])\s+", compact_text):
        if "accessor" not in sentence.lower():
            continue
        cleaned = sentence.strip()
        if 15 <= len(cleaned) <= 360 and cleaned not in accessory_sentences:
            accessory_sentences.append(cleaned)
        if len(accessory_sentences) == 2:
            break
    if accessory_sentences:
        extracted["Required Accessories"] = " ".join(accessory_sentences)

    notes_match = re.search(
        r"(?:^|\n)\s*Notes\s*\n(.+?)(?=\n\s*Complies\b|\n\s*Technical\s+data\b|\Z)",
        text,
        flags=re.I | re.S,
    )
    if notes_match:
        notes = re.sub(r"\s+", " ", notes_match.group(1)).strip()
        if notes:
            extracted["General Notes"] = notes[:700]

    if not custom_columns:
        return extracted

    alias_to_target = {
        re.sub(r"[^a-z0-9]+", "", alias.lower()): target
        for target, aliases in DEFAULT_SPECIFICATION_FIELD_ALIASES.items()
        for alias in aliases
    }
    requested: dict[str, str] = {}
    for column in custom_columns:
        name = str(column.get("name") or "").strip()
        target = alias_to_target.get(re.sub(r"[^a-z0-9]+", "", name.lower()))
        if name and target and clean_schedule_value(extracted.get(target)):
            requested[name] = extracted[target]
    return requested


def merge_non_empty(primary: dict, fallback: dict) -> dict:
    merged = dict(fallback or {})
    for key, value in (primary or {}).items():
        if clean_schedule_value(value):
            merged[key] = value
    return merged


def schedule_product_data_to_result(product_data: dict | None) -> dict:
    if not isinstance(product_data, dict):
        return {"metadata": {}, "custom_fields": {}}

    def get(*keys: str) -> str:
        for key in keys:
            value = clean_schedule_value(product_data.get(key))
            if value:
                return value
        return ""

    metadata = {
        "type": get("Type"),
        "manufacturer": get("Manufacturer"),
        "product": get("Product"),
        "spec_code": get("Spec Code", "SpecCode", "Product Code"),
        "description": get("Description"),
        "colour": get("Colour", "Color"),
        "cct": get("CCT", "Colour Temperature", "Color Temperature"),
        "cri": get("CRI"),
        "unit_watts": get("Unit Watts", "UnitWatts", "Watts", "Wattage", "Power"),
        "dimming": get("Dimming", "Dimming Protocols", "Dimming Options"),
        "quantity": get("Qty", "Quantity"),
        "ip_rating": get("IP Rating", "IP", "Protective Rating"),
        "total_watts": get("Total Watts", "TotalWatts"),
        "template_pdf": get("Template PDF", "TemplatePdf", "Template"),
    }

    custom_fields = {}
    for key in ["Light Output", "Luminaire Ref.", "Weight", "Beam Angle"]:
        value = get(key)
        if value:
            custom_fields[key] = value

    metadata = {key: value for key, value in metadata.items() if clean_schedule_value(value)}
    return {"metadata": metadata, "custom_fields": custom_fields}


def product_specs_summary(product: dict) -> str:
    summary = []
    for spec in product.get("specifications") or []:
        if not isinstance(spec, dict):
            continue
        name = str(spec.get("name") or "").strip()
        value = format_spec_value(spec)
        if name and value:
            summary.append(f"{name}: {value}")
    return "; ".join(summary)


def extract_ip_rating(value: str) -> str:
    match = re.search(r"\bIP(?:\s+[A-Za-z]+)?\s*[:#-]?\s*([0-9]{2})\b", value or "", flags=re.I)
    return f"IP{match.group(1)}" if match else ""


def normalize_ip_rating(value: str) -> str:
    value = value.strip()
    if not value:
        return value
    extracted = extract_ip_rating(value)
    if extracted:
        return extracted
    if value.isdigit():
        return f"IP{value}"
    return value


def extract_cct_options(value: str) -> str:
    matches = re.findall(r"\b\d{3,5}\s*K\b", value or "", flags=re.I)
    cleaned = [re.sub(r"\s+", "", match).upper() for match in matches]
    return " / ".join(dict.fromkeys(cleaned))


def normalize_cct_value(value: str) -> str:
    text = value.strip()
    if not text:
        return text
    return extract_cct_options(text) or text


def extract_dimming_options(value: str) -> str:
    text = value or ""
    options: list[str] = []
    if re.search(r"without\s+dimmer|non[-\s]?dimmable|no\s+dimmer", text, flags=re.I):
        options.append("Without Dimmer")
    if re.search(r"0\s*[-–—]?\s*10\s*V", text, flags=re.I):
        options.append("0-10V")
    if re.search(r"\bDALI\b", text, flags=re.I):
        options.append("DALI")
    if re.search(r"\bCASAMBI\b", text, flags=re.I):
        options.append("CASAMBI")
    return " / ".join(dict.fromkeys(options))


def normalize_dimming_value(value: str) -> str:
    text = value.strip()
    if not text:
        return text
    return extract_dimming_options(text) or text


def extract_lumen_options(value: str) -> str:
    matches = re.findall(r"\b\d+(?:[.,]\d+)?\s*lm\b", value or "", flags=re.I)
    cleaned = [re.sub(r"\s+", "", match).replace(",", ".") for match in matches]
    return " / ".join(dict.fromkeys(cleaned))


def parse_wattage_multiplier(value: str) -> tuple[str, str, str]:
    text = value.strip()
    match = re.search(r"(\d+(?:\.\d+)?)\s*W\s*(?:\*|x|×)\s*(\d+)", text, flags=re.I)
    if not match:
        return text, "", ""
    watts_value = float(match.group(1))
    watts_text = str(int(watts_value)) if watts_value.is_integer() else str(watts_value).rstrip("0").rstrip(".")
    quantity = match.group(2)
    total = watts_value * int(quantity)
    total_text = str(int(total)) if total.is_integer() else str(total).rstrip("0").rstrip(".")
    return f"{watts_text}W", quantity, f"{total_text}W"


def external_product_to_metadata(product: dict | None) -> dict:
    if not isinstance(product, dict) or not product:
        return {}

    brand = str(product.get("brand") or "").strip()
    collection = str(product.get("collection_or_series") or "").strip()
    product_name = str(product.get("product_name") or "").strip()
    finish = str(product.get("finish") or "").strip()
    sku = str(product.get("sku") or "").strip()
    category = str(product.get("category") or "").strip()
    specs_summary = product_specs_summary(product)

    wattage_values = find_product_spec_values(product, "LED Watt", "LED Watts", "Max Wattage", "Wattage", "Watts", "Power", "Power (W)", "Electrical System", "System Power", "System power (W)", "Input Power", "Rated Power", "Circuit Power")
    wattage = join_spec_options(wattage_values)
    unit_watts, quantity, total_watts = parse_wattage_multiplier(wattage)
    cct_source = find_product_spec(
        product,
        "CCT",
        "LED CCT",
        "LED CRI/CCT",
        "CRI/CCT",
        "Colour Temperature",
        "Color Temperature",
        "Colour Temperatures",
        "Color Temperatures",
        "CCT Options",
        "CCT (Color Temperature) Options",
        "CCT (Colour Temperature) Options",
        "Color Temperature Options",
        "Colour Temperature Options",
        "Light Colour",
        "Light Color",
    )
    cct = normalize_cct_value(cct_source) if cct_source else extract_cct_options(specs_summary)
    ip_source = find_product_spec(product, "IP Rating", "IP", "Degree of Protection", "Ingress Protection", "Protective Rating", "Protection Rating", "Technical & Protection Ratings", "Technical and Protection Ratings")
    ip_rating = normalize_ip_rating(ip_source) if ip_source else extract_ip_rating(specs_summary)
    dimming_source = find_product_spec(
        product,
        "Dimming",
        "Dimmable",
        "Dimming Type",
        "Dimming Options",
        "Dimming Option",
        "Dimming Protocols",
        "Dimming Protocol",
        "Optional Dimming",
        "Control",
        "Control Options",
        "Control Gear",
    )
    dimming = normalize_dimming_value(dimming_source) if dimming_source else extract_dimming_options(specs_summary)

    product_label = " ".join(part for part in [collection, product_name] if part).strip() or product_name
    description_parts = [part for part in [product_label, finish, specs_summary] if part]

    return {
        "type": category or product_name,
        "manufacturer": brand,
        "product": product_label,
        "spec_code": sku,
        "description": " - ".join(description_parts),
        "colour": finish,
        "cct": cct,
        "cri": find_product_spec(product, "CRI", "Colour Rendering Index", "Color Rendering Index"),
        "unit_watts": unit_watts,
        "dimming": dimming,
        "quantity": quantity,
        "ip_rating": ip_rating,
        "total_watts": total_watts,
    }


def extract_product_diagram_with_external_api(pdf_path: str, temp_dir: Path) -> dict:
    if not EXTERNAL_EXTRACTOR_API_KEY:
        return {"metadata": {}}

    headers = {
        "X-API-Key": EXTERNAL_EXTRACTOR_API_KEY,
        "X-OpenAI-Model": EXTERNAL_EXTRACTOR_MODEL,
    }
    with open(pdf_path, "rb") as pdf_file:
        response = requests.post(
            EXTERNAL_EXTRACTOR_URL,
            headers=headers,
            files={"file": (Path(pdf_path).name, pdf_file, "application/pdf")},
            data={"mode": EXTERNAL_EXTRACTOR_MODE},
            timeout=EXTERNAL_EXTRACTOR_TIMEOUT,
        )
    response.raise_for_status()
    payload = response.json()
    result = (payload.get("results") or [payload])[0] if isinstance(payload, dict) else {}
    product = result.get("product") or (payload.get("product") if isinstance(payload, dict) else {})
    return {
        "product_image_path": save_external_image(result.get("product_image"), temp_dir, "product"),
        "diagram_image_path": save_external_image(result.get("diagram_image"), temp_dir, "diagram"),
        "polar_image_path": save_external_image(
            result.get("polar_image") or result.get("polar_curve"),
            temp_dir,
            "polar",
        ),
        "metadata": external_product_to_metadata(product),
        "external_product": product if isinstance(product, dict) else {},
        "diagram_data": result.get("diagram_data") or (payload.get("diagram_data") if isinstance(payload, dict) else []),
    }


def extract_schedule_with_external_api(pdf_path: str, temp_dir: Path) -> dict:
    if not EXTERNAL_EXTRACTOR_API_KEY:
        return {"metadata": {}, "custom_fields": {}}

    headers = {
        "X-API-Key": EXTERNAL_EXTRACTOR_API_KEY,
        "X-OpenAI-Model": EXTERNAL_EXTRACTOR_MODEL,
    }
    with open(pdf_path, "rb") as pdf_file:
        response = requests.post(
            EXTERNAL_SCHEDULE_EXTRACTOR_URL,
            headers=headers,
            files={"file": (Path(pdf_path).name, pdf_file, "application/pdf")},
            data={"mode": EXTERNAL_EXTRACTOR_MODE},
            timeout=EXTERNAL_EXTRACTOR_TIMEOUT,
        )
    response.raise_for_status()
    payload = response.json()
    documents = payload.get("documents") if isinstance(payload, dict) else None
    document = (documents or [payload])[0] if isinstance(payload, dict) else {}
    product_data = document.get("product_data") if isinstance(document, dict) else {}
    images = document.get("images") if isinstance(document, dict) else {}
    mapped = schedule_product_data_to_result(product_data)

    product_media = images.get("product") if isinstance(images, dict) else None
    diagram_media = images.get("diagram") if isinstance(images, dict) else None
    polar_media = None
    if isinstance(images, dict):
        polar_media = (
            images.get("polar")
            or images.get("polar_curve")
            or images.get("polarCurve")
            or images.get("photometric")
            or images.get("photometry")
        )
    if isinstance(product_data, dict):
        product_media = product_media or product_data.get("Photo")
        diagram_media = diagram_media or product_data.get("Diagram")
        polar_media = (
            polar_media
            or product_data.get("Polar Curve")
            or product_data.get("Polar")
            or product_data.get("Photometric Distribution")
        )

    print(
        "Schedule extractor 8766 response:",
        {
            "document_keys": list(document.keys()) if isinstance(document, dict) else [],
            "product_data_keys": list(product_data.keys()) if isinstance(product_data, dict) else [],
            "image_keys": list(images.keys()) if isinstance(images, dict) else [],
            "service_duration_seconds": (
                payload.get("duration_seconds")
                if isinstance(payload, dict)
                else None
            ),
        },
    )

    return {
        "product_image_path": save_external_image(product_media, temp_dir, "product_schedule"),
        "diagram_image_path": save_external_image(diagram_media, temp_dir, "diagram_schedule"),
        "polar_image_path": save_external_image(polar_media, temp_dir, "polar_schedule"),
        "metadata": mapped.get("metadata", {}),
        "custom_fields": mapped.get("custom_fields", {}),
        "product_data": product_data if isinstance(product_data, dict) else {},
        "raw_payload": payload if isinstance(payload, dict) else {},
    }


def process_luminaire_document(
    pdf_path: str,
    api_key: str,
    keep_temp: bool = False,
    custom_columns: list[dict] | None = None,
) -> dict:
    extraction_started = time.perf_counter()
    timings: dict[str, float] = {}
    work_dir = TEMP_ROOT / uuid.uuid4().hex
    work_dir.mkdir(parents=True, exist_ok=True)

    document_sha256 = ""
    cache_key = ""
    cache_started = time.perf_counter()
    if EXTRACTION_CACHE_ENABLED:
        try:
            document_sha256, cache_key = extraction_cache_identity(
                pdf_path,
                custom_columns,
            )
            cached_result = restore_cached_extraction(cache_key, work_dir)
            timings["cache_lookup"] = time.perf_counter() - cache_started
            if cached_result is not None:
                timings["total"] = time.perf_counter() - extraction_started
                cached_result["temp_dir"] = str(work_dir)
                cached_result["cache_hit"] = True
                print(
                    "Extraction cache hit:",
                    {
                        "document_sha256": document_sha256[:12],
                        "cache_key": cache_key[:12],
                        "total": round(timings["total"], 3),
                    },
                )
                return cached_result
        except Exception as exc:
            timings["cache_lookup"] = time.perf_counter() - cache_started
            print(
                "Extraction cache lookup unavailable:",
                f"{type(exc).__name__}: {exc}",
            )
    else:
        timings["cache_lookup"] = time.perf_counter() - cache_started

    local_started = time.perf_counter()
    try:
        with fitz.open(pdf_path) as pdf_document:
            page_count = pdf_document.page_count
            pdf_text = extract_pdf_text(pdf_document, max_chars=18000)
            asset_candidates = extract_asset_candidates(pdf_document, work_dir)
            asset_candidates.extend(
                extract_erco_vector_asset_candidates(
                    pdf_document,
                    pdf_text,
                    work_dir,
                )
            )
            vector_dimension_candidates = (
                extract_vector_dimension_asset_candidates(
                    pdf_document,
                    work_dir,
                )
            )
            asset_candidates.extend(vector_dimension_candidates)
            if not vector_dimension_candidates:
                asset_candidates.extend(
                    extract_clustered_vector_asset_candidates(
                        pdf_document,
                        work_dir,
                    )
                )
        timings["local_pdf"] = time.perf_counter() - local_started
    except Exception as exc:
        if not keep_temp and work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)
        raise RuntimeError(f"Local PDF asset extraction failed for {pdf_path}: {exc}") from exc

    deterministic_custom_fields = extract_default_specification_fields_from_text(
        pdf_text,
        custom_columns=custom_columns,
    )

    def run_schedule_extraction() -> tuple[dict, float]:
        started = time.perf_counter()
        result = extract_schedule_with_external_api(pdf_path, work_dir)
        return result, time.perf_counter() - started

    def run_custom_extraction() -> tuple[dict, float]:
        started = time.perf_counter()
        result = extract_custom_fields_with_llm(
            [candidate["path"] for candidate in asset_candidates],
            pdf_text,
            api_key,
            custom_columns or [],
        )
        return result, time.perf_counter() - started

    def run_ip_badge_ocr() -> tuple[str, float]:
        started = time.perf_counter()
        try:
            with fitz.open(pdf_path) as pdf_document:
                value = extract_ip_rating_from_pdf_badges(
                    pdf_document,
                    work_dir,
                )
        except Exception as exc:
            print(
                "IP rating fallback unavailable:",
                f"{type(exc).__name__}: {exc}",
            )
            value = ""
        return value, time.perf_counter() - started

    schedule_result = {"metadata": {}, "custom_fields": {}}
    custom_result = {"custom_fields": {}}
    deterministic_ip_rating = ""
    product_image = None
    diagram_image = None
    polar_image = None
    fast_path_used = False

    if 0 < page_count <= FAST_PATH_MAX_PAGES:
        fast_path_started = time.perf_counter()
        try:
            embedded_candidates = [
                candidate
                for candidate in asset_candidates
                if candidate.get("source") == "embedded"
            ]
            deterministic_candidates = [
                candidate
                for candidate in asset_candidates
                if candidate.get("source") != "embedded"
            ]
            fast_candidates = embedded_candidates[:9]
            for candidate in deterministic_candidates:
                if candidate not in fast_candidates:
                    fast_candidates.append(candidate)
                if len(fast_candidates) >= 12:
                    break
            for candidate in asset_candidates:
                if candidate not in fast_candidates:
                    fast_candidates.append(candidate)
                if len(fast_candidates) >= 12:
                    break

            with ThreadPoolExecutor(max_workers=3) as executor:
                fast_future = executor.submit(
                    extract_with_llm,
                    [candidate["path"] for candidate in fast_candidates],
                    pdf_text,
                    api_key,
                    custom_columns or [],
                )
                asset_future = executor.submit(
                    select_document_assets,
                    asset_candidates,
                    pdf_text,
                    api_key,
                    None,
                    None,
                    None,
                )
                ip_ocr_future = executor.submit(run_ip_badge_ocr)
                fast_result = fast_future.result()
                product_image, diagram_image, polar_image = asset_future.result()
                deterministic_ip_rating, timings["ip_badge_ocr"] = ip_ocr_future.result()

            timings["fast_ai"] = time.perf_counter() - fast_path_started
            fast_metadata = dict(fast_result.get("metadata", {}) or {})
            populated_metadata = sum(
                1
                for value in fast_metadata.values()
                if clean_schedule_value(value)
            )
            if (
                not clean_schedule_value(fast_metadata.get("product"))
                or not (
                    clean_schedule_value(fast_metadata.get("manufacturer"))
                    or clean_schedule_value(fast_metadata.get("spec_code"))
                )
                or populated_metadata < 6
            ):
                raise ValueError("fast metadata failed completeness validation")

            vector_diagrams = [
                candidate["path"]
                for candidate in asset_candidates
                if (
                    candidate.get("source") == "deterministic_vector_dimension"
                    and float((candidate.get("metrics") or {}).get("white") or 0) >= 0.72
                    and float((candidate.get("metrics") or {}).get("ink") or 1) <= 0.20
                    and 0.45 <= float((candidate.get("metrics") or {}).get("aspect") or 0) <= 4.0
                )
            ]
            if not diagram_image and len(vector_diagrams) == 1:
                diagram_image = vector_diagrams[0]

            if asset_candidates and not product_image:
                raise ValueError("fast image selection did not identify a product image")

            if not clean_schedule_value(fast_metadata.get("quantity")):
                fast_metadata["quantity"] = "1"
            if (
                not clean_schedule_value(fast_metadata.get("total_watts"))
                and clean_schedule_value(fast_metadata.get("unit_watts"))
                and fast_metadata.get("quantity") == "1"
            ):
                fast_metadata["total_watts"] = fast_metadata["unit_watts"]

            schedule_result = {
                "metadata": fast_metadata,
                "custom_fields": {},
            }
            custom_result = {
                "custom_fields": dict(
                    fast_result.get("custom_fields", {}) or {}
                )
            }
            timings["asset_selection"] = 0.0
            fast_path_used = True
            print(
                "Fast extraction accepted:",
                {
                    "page_count": page_count,
                    "metadata_fields": populated_metadata,
                    "product": Path(product_image).name if product_image else None,
                    "diagram": Path(diagram_image).name if diagram_image else None,
                    "polar": Path(polar_image).name if polar_image else None,
                    "elapsed": round(timings["fast_ai"], 3),
                },
            )
        except Exception as exc:
            timings["fast_path_attempt"] = (
                time.perf_counter() - fast_path_started
            )
            print(
                "Fast extraction fallback:",
                f"{type(exc).__name__}: {exc}",
            )

    if not fast_path_used:
        # The legacy extractor remains the quality-preserving fallback for large,
        # incomplete, or failed fast-path documents.
        try:
            with ThreadPoolExecutor(max_workers=3) as executor:
                schedule_future = executor.submit(run_schedule_extraction)
                ip_ocr_future = executor.submit(run_ip_badge_ocr)
                custom_future = (
                    executor.submit(run_custom_extraction)
                    if custom_columns
                    else None
                )
                schedule_result, timings["schedule_extractor"] = schedule_future.result()
                deterministic_ip_rating, timings["ip_badge_ocr"] = ip_ocr_future.result()
                if custom_future is not None:
                    custom_result, timings["custom_ai"] = custom_future.result()
        except Exception as exc:
            if not keep_temp and work_dir.exists():
                shutil.rmtree(work_dir, ignore_errors=True)
            if "schedule_future" in locals() and schedule_future.done():
                try:
                    schedule_future.result()
                except Exception as schedule_exc:
                    raise RuntimeError(
                        f"Schedule PDF extractor failed for {pdf_path}: {schedule_exc}"
                    ) from schedule_exc
            if "custom_future" in locals() and custom_future is not None and custom_future.done():
                try:
                    custom_future.result()
                except Exception as custom_exc:
                    raise RuntimeError(
                        f"Custom AI column extraction failed for {pdf_path}: {custom_exc}"
                    ) from custom_exc
            raise RuntimeError(f"PDF extraction failed for {pdf_path}: {exc}") from exc

        asset_selection_started = time.perf_counter()
        try:
            product_image, diagram_image, polar_image = select_document_assets(
                asset_candidates,
                pdf_text,
                api_key,
                schedule_result.get("product_image_path"),
                schedule_result.get("diagram_image_path"),
                schedule_result.get("polar_image_path"),
            )
            timings["asset_selection"] = time.perf_counter() - asset_selection_started
        except Exception:
            if not keep_temp and work_dir.exists():
                shutil.rmtree(work_dir, ignore_errors=True)
            raise

    metadata = dict(schedule_result.get("metadata", {}) or {})
    if deterministic_ip_rating and not clean_schedule_value(metadata.get("ip_rating")):
        metadata["ip_rating"] = deterministic_ip_rating
        print(
            "IP rating fallback:",
            {
                "method": "local_raster_badge_ocr",
                "value": deterministic_ip_rating,
            },
        )

    custom_fields = merge_non_empty(
        custom_result.get("custom_fields", {}),
        schedule_result.get("custom_fields", {}),
    )
    deterministic_preferred = {
        "lightsource",
        "macadamsdcm",
        "beamdistribution",
        "deliveredlumens",
        "ledlifetime",
        "inputvoltage",
        "material",
        "dimmingcontrol",
        "ikrating",
        "weight",
        "operatingtemperature",
    }
    for field_name, field_value in deterministic_custom_fields.items():
        normalized_name = re.sub(r"[^a-z0-9]+", "", field_name.lower())
        if normalized_name in deterministic_preferred or not clean_schedule_value(custom_fields.get(field_name)):
            custom_fields[field_name] = field_value

    result = {
        "metadata": metadata,
        "custom_fields": custom_fields,
        "product_image_path": product_image,
        "diagram_image_path": diagram_image,
        "polar_image_path": polar_image,
    }

    cache_store_started = time.perf_counter()
    if EXTRACTION_CACHE_ENABLED and cache_key and document_sha256:
        try:
            store_cached_extraction(
                cache_key,
                document_sha256,
                result,
            )
        except Exception as exc:
            print(
                "Extraction cache store unavailable:",
                f"{type(exc).__name__}: {exc}",
            )
    timings["cache_store"] = time.perf_counter() - cache_store_started
    result["cache_hit"] = False

    timings["total"] = time.perf_counter() - extraction_started
    print(
        "Extraction timings:",
        {
            key: round(value, 3)
            for key, value in timings.items()
        },
    )

    # Keep the temp directory until api.save_extracted_asset() moves downloaded
    # extractor images into permanent storage. Removing it here drops image paths.
    result["temp_dir"] = str(work_dir)

    return result
