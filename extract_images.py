from __future__ import annotations

import base64
import json
import os
import re
import shutil
import uuid
from pathlib import Path

import fitz
from openai import OpenAI


BASE_DIR = Path(__file__).resolve().parent
TEMP_ROOT = BASE_DIR / "data" / "temp"
TEMP_ROOT.mkdir(parents=True, exist_ok=True)


def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


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
    candidate_paths = []
    for page_num in range(len(pdf_document)):
        page = pdf_document[page_num]
        image_list = page.get_images()

        for img_index, img in enumerate(image_list):
            xref = img[0]
            base_image = pdf_document.extract_image(xref)
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            width = base_image.get("width", 0)
            height = base_image.get("height", 0)

            if width < 240 or height < 240:
                continue

            image_filename = f"page{page_num + 1}_img{img_index + 1}_{width}x{height}.{image_ext}"
            temp_filepath = temp_dir / image_filename
            temp_filepath.write_bytes(image_bytes)
            candidate_paths.append(str(temp_filepath))

    return candidate_paths


def build_llm_payload(candidate_paths: list[str], pdf_text: str) -> list[dict]:
    content = [
        {
            "type": "text",
            "text": (
                "You are extracting luminaire schedule details from a PDF. "
                "Choose one best product image and one best diagram image from the candidates. "
                "Then extract the luminaire metadata from the PDF text. "
                "Return strict JSON with this shape only: "
                '{"product_image_filename":"","diagram_image_filename":"","metadata":{"type":"","manufacturer":"","product":"","spec_code":"","description":"","colour":"","cct":"","cri":"","unit_watts":"","dimming":"","quantity":"","ip_rating":"","total_watts":""}}. '
                "Use empty strings when a field is missing. Prefer concise field values."
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


def extract_with_llm(candidate_paths: list[str], pdf_text: str, api_key: str) -> dict:
    if not api_key:
        raise ValueError("OpenAI API key is required for document processing.")

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": build_llm_payload(candidate_paths, pdf_text)}],
        max_tokens=700,
    )
    raw_text = response.choices[0].message.content or "{}"
    parsed = safe_json_loads(raw_text)
    parsed.setdefault("metadata", {})
    return parsed


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


def process_luminaire_document(pdf_path: str, api_key: str, keep_temp: bool = False) -> dict:
    pdf_document = fitz.open(pdf_path)
    pdf_text = extract_pdf_text(pdf_document)
    work_dir = TEMP_ROOT / uuid.uuid4().hex
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        candidate_paths = extract_candidate_images(pdf_document, work_dir)
    finally:
        pdf_document.close()

    llm_result = {"metadata": {}}
    if candidate_paths or pdf_text:
        llm_result = extract_with_llm(candidate_paths, pdf_text, api_key=api_key)

    fallback_product, fallback_diagram = choose_fallback_images(candidate_paths)
    product_image = match_candidate(candidate_paths, llm_result.get("product_image_filename")) or fallback_product
    diagram_image = match_candidate(candidate_paths, llm_result.get("diagram_image_filename")) or fallback_diagram

    preserved_paths = {path for path in [product_image, diagram_image] if path}
    if not keep_temp:
        for candidate in candidate_paths:
            if candidate not in preserved_paths and os.path.exists(candidate):
                os.remove(candidate)

    result = {
        "metadata": llm_result.get("metadata", {}),
        "product_image_path": product_image,
        "diagram_image_path": diagram_image,
    }

    if keep_temp:
        result["temp_dir"] = str(work_dir)
    elif not preserved_paths and work_dir.exists():
        shutil.rmtree(work_dir, ignore_errors=True)

    return result
