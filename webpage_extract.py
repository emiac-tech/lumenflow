"""Read luminaire data directly from manufacturer product web pages.

Flow for a submitted URL that is not a PDF:
1. Manufacturer adapters (currently iGuzzini) read the structured product JSON
   embedded in the page. No AI call is needed for the core schedule fields.
2. Other sites: page text, tables and embedded JSON plus a few page images are
   sent to the same vision model used for PDFs.
3. If the page data is still incomplete, a datasheet PDF linked on the page is
   downloaded and processed with the normal PDF pipeline.
"""

from __future__ import annotations

import html as html_lib
import ipaddress
import json
import re
import shutil
import socket
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image

from extract_images import (
    DEFAULT_SPECIFICATION_FIELD_ALIASES,
    TEMP_ROOT,
    clean_schedule_value,
    extract_custom_fields_with_llm,
    extract_default_specification_fields_from_text,
    extract_with_llm,
    match_candidate,
    process_luminaire_document,
)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}
MAX_PAGE_BYTES = 12 * 1024 * 1024
MAX_PDF_BYTES = 60 * 1024 * 1024
MAX_IMAGE_BYTES = 12 * 1024 * 1024
PAGE_TIMEOUT = (10, 45)
IMAGE_TIMEOUT = (6, 20)
MAX_PAGE_TEXT_CHARS = 18000
MAX_GENERIC_IMAGES = 8


class UnsafeUrlError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Safe downloading
# ---------------------------------------------------------------------------

def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise UnsafeUrlError(f"Only public http(s) URLs are supported: {url}")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(parsed.hostname, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise ValueError(f"Could not resolve host {parsed.hostname}") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
            or address.is_multicast
            or address.is_unspecified
        ):
            raise UnsafeUrlError(f"This URL points to a private or local address: {url}")


def safe_get(url: str, *, max_bytes: int, timeout=PAGE_TIMEOUT) -> tuple[requests.Response, bytes, str]:
    """GET a public URL, re-checking every redirect hop, with a size limit."""
    current = url
    for _ in range(6):
        assert_public_url(current)
        response = requests.get(
            current,
            headers=BROWSER_HEADERS,
            timeout=timeout,
            stream=True,
            allow_redirects=False,
        )
        if response.status_code in {301, 302, 303, 307, 308}:
            location = response.headers.get("location")
            response.close()
            if not location:
                raise ValueError(f"Redirect without a location: {current}")
            current = urljoin(current, location)
            continue
        response.raise_for_status()
        chunks: list[bytes] = []
        total = 0
        for chunk in response.iter_content(65536):
            total += len(chunk)
            if total > max_bytes:
                response.close()
                raise ValueError(f"Document is larger than {max_bytes // (1024 * 1024)} MB: {url}")
            chunks.append(chunk)
        return response, b"".join(chunks), current
    raise ValueError(f"Too many redirects: {url}")


def looks_like_pdf(content: bytes, content_type: str, url: str) -> bool:
    if content[:5] == b"%PDF-":
        return True
    return "application/pdf" in (content_type or "").lower() and content.lstrip()[:5] == b"%PDF-"


def decode_html(response: requests.Response, content: bytes) -> str:
    encoding = response.encoding or "utf-8"
    if encoding.lower() in {"iso-8859-1", "latin-1"}:
        # requests defaults to latin-1 when the header has no charset.
        encoding = response.apparent_encoding or "utf-8"
    try:
        return content.decode(encoding, errors="replace")
    except LookupError:
        return content.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

SKIP_TAGS = {"script", "style", "noscript", "svg", "template", "head", "nav", "header", "footer", "iframe"}
BLOCK_TAGS = {
    "p", "div", "section", "article", "li", "ul", "ol", "tr", "table", "h1", "h2", "h3",
    "h4", "h5", "h6", "dt", "dd", "dl", "br", "main", "aside", "figure", "figcaption",
}
NOISE_IMAGE_PATTERN = re.compile(
    r"logo|icon|sprite|flag|avatar|payment|social|facebook|instagram|linkedin|youtube|pinterest|"
    r"twitter|badge|banner|placeholder|loader|spinner|arrow|cookie|1x1|pixel",
    re.I,
)


class ProductPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.text_parts: list[str] = []
        self.title = ""
        self.h1 = ""
        self.meta: dict[str, str] = {}
        self.images: list[dict] = []
        self.links: list[dict] = []
        self.json_scripts: list[str] = []
        self.json_attributes: list[tuple[str, str]] = []
        self.table_lines: list[str] = []
        self._in_title = False
        self._in_h1 = False
        self._script_kind: Optional[str] = None
        self._script_buffer: list[str] = []
        self._row: Optional[list[str]] = None
        self._cell: Optional[list[str]] = None
        self._dt: Optional[str] = None
        self._def_buffer: Optional[list[str]] = None
        self._def_tag: Optional[str] = None
        self._link: Optional[dict] = None

    def handle_starttag(self, tag: str, attrs_list) -> None:
        attrs = {key.lower(): (value or "") for key, value in attrs_list}
        for key, value in attrs.items():
            if key.startswith("data-") and value[:1] in "{[" and 2 < len(value) < 600_000:
                self.json_attributes.append((key, value))

        if tag == "meta":
            name = (attrs.get("property") or attrs.get("name") or "").lower()
            if name and attrs.get("content"):
                self.meta.setdefault(name, attrs["content"])
            return
        if tag == "script":
            script_type = attrs.get("type", "").lower()
            if "ld+json" in script_type:
                self._script_kind = "ld"
            elif "json" in script_type or attrs.get("id") == "__NEXT_DATA__":
                self._script_kind = "json"
            else:
                self._script_kind = None
            self._script_buffer = []
        if tag == "title":
            self._in_title = True
        if tag == "img":
            src = attrs.get("src") or attrs.get("data-src") or attrs.get("data-lazy-src") or attrs.get("data-original") or ""
            srcset = attrs.get("srcset") or attrs.get("data-srcset") or ""
            if srcset:
                last = srcset.split(",")[-1].strip().split(" ")[0]
                if last:
                    src = last
            if src and not src.startswith("data:"):
                self.images.append({
                    "src": src,
                    "alt": attrs.get("alt", ""),
                    "width": attrs.get("width", ""),
                    "height": attrs.get("height", ""),
                    "in_chrome": self.skip_depth > 0,
                })
            return
        if tag in {"br", "hr", "input", "link", "source", "wbr"}:
            if tag == "br" and self.skip_depth == 0:
                self.text_parts.append("\n")
            return
        if tag == "a":
            self._link = {"href": attrs.get("href", ""), "text": [], "in_chrome": self.skip_depth > 0}
        if tag in SKIP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag == "h1":
            self._in_h1 = True
        if tag == "tr":
            self._row = []
        if tag in {"td", "th"} and self._row is not None:
            self._cell = []
        if tag in {"dt", "dd"}:
            self._def_tag = tag
            self._def_buffer = []
        if tag in BLOCK_TAGS:
            self.text_parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            if self._script_kind and self._script_buffer:
                self.json_scripts.append("".join(self._script_buffer))
            self._script_kind = None
            self._script_buffer = []
        if tag == "title":
            self._in_title = False
        if tag == "a" and self._link is not None:
            self._link["text"] = " ".join(self._link["text"]).strip()
            self.links.append(self._link)
            self._link = None
        if tag in SKIP_TAGS:
            if self.skip_depth:
                self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag == "h1":
            self._in_h1 = False
        if tag in {"td", "th"} and self._row is not None and self._cell is not None:
            cell = re.sub(r"\s+", " ", " ".join(self._cell)).strip()
            if cell:
                self._row.append(cell)
            self._cell = None
        if tag == "tr" and self._row is not None:
            if len(self._row) >= 2:
                self.table_lines.append(f"{self._row[0]}: {' | '.join(self._row[1:])}")
            self._row = None
        if tag in {"dt", "dd"} and self._def_buffer is not None:
            value = re.sub(r"\s+", " ", " ".join(self._def_buffer)).strip()
            if tag == "dt":
                self._dt = value
            elif self._dt and value:
                self.table_lines.append(f"{self._dt}: {value}")
                self._dt = None
            self._def_buffer = None
        if tag in BLOCK_TAGS:
            self.text_parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._script_kind is not None:
            self._script_buffer.append(data)
            return
        if self._in_title:
            self.title += data
        if self._link is not None and data.strip():
            self._link["text"].append(data.strip())
        if self.skip_depth:
            return
        text = data.strip()
        if not text:
            return
        if self._in_h1:
            self.h1 = f"{self.h1} {text}".strip()
        if self._cell is not None:
            self._cell.append(text)
        if self._def_buffer is not None:
            self._def_buffer.append(text)
        self.text_parts.append(text + " ")


def parse_page(page_html: str) -> ProductPageParser:
    parser = ProductPageParser()
    try:
        parser.feed(page_html)
        parser.close()
    except Exception as exc:  # malformed HTML should not kill the import
        print("HTML parse warning:", f"{type(exc).__name__}: {exc}")
    return parser


def visible_text(parser: ProductPageParser) -> str:
    raw = "".join(parser.text_parts)
    lines: list[str] = []
    seen: set[str] = set()
    for line in raw.split("\n"):
        cleaned = re.sub(r"[ \t]+", " ", line).strip()
        if len(cleaned) < 2 or cleaned in seen:
            continue
        seen.add(cleaned)
        lines.append(cleaned)
    return "\n".join(lines)


def flatten_json(value: object, prefix: str = "", out: Optional[list[str]] = None, limit: int = 500) -> list[str]:
    out = out if out is not None else []
    if len(out) >= limit:
        return out
    if isinstance(value, dict):
        for key, item in value.items():
            flatten_json(item, str(key), out, limit)
    elif isinstance(value, list):
        for item in value[:30]:
            flatten_json(item, prefix, out, limit)
    elif value not in (None, "", False):
        text = re.sub(r"\s+", " ", str(value)).strip()
        if text and len(text) <= 240 and not text.startswith(("http://", "https://", "/")):
            out.append(f"{prefix}: {text}" if prefix else text)
    return out


def load_json_loose(raw: str) -> object:
    try:
        return json.loads(html_lib.unescape(raw.strip()))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------

def download_image(url: str, target_dir: Path, prefix: str) -> Optional[str]:
    try:
        response, content, _ = safe_get(url, max_bytes=MAX_IMAGE_BYTES, timeout=IMAGE_TIMEOUT)
        content_type = response.headers.get("content-type", "").lower()
        if "svg" in content_type or content.lstrip()[:4] in {b"<svg", b"<?xm"}:
            return None
        with Image.open(BytesIO(content)) as image:
            image.load()
            if min(image.size) < 120:
                return None
            has_alpha = image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info)
            if has_alpha:
                converted = image.convert("RGBA")
                background = Image.new("RGBA", converted.size, (255, 255, 255, 255))
                background.alpha_composite(converted)
                final = background.convert("RGB")
            else:
                final = image.convert("RGB")
            if max(final.size) > 1600:
                final.thumbnail((1600, 1600))
            path = target_dir / f"{prefix}_{uuid.uuid4().hex[:8]}.jpg"
            final.save(path, "JPEG", quality=90)
            return str(path)
    except Exception as exc:
        print("Web image skipped:", url[:160], f"{type(exc).__name__}: {exc}")
        return None


def download_images_parallel(urls: list[tuple[str, str]], target_dir: Path) -> dict[str, Optional[str]]:
    """urls: list of (key, url). Returns key -> local path (or None)."""
    results: dict[str, Optional[str]] = {}
    if not urls:
        return results
    with ThreadPoolExecutor(max_workers=min(6, len(urls))) as executor:
        futures = {key: executor.submit(download_image, url, target_dir, key) for key, url in urls}
        for key, future in futures.items():
            results[key] = future.result()
    return results


# ---------------------------------------------------------------------------
# Default specification columns
# ---------------------------------------------------------------------------

def map_specification_targets(targets: dict[str, str], custom_columns: list[dict] | None) -> dict[str, str]:
    """Map canonical default-spec values (e.g. 'Delivered Lumens') to the project's column names."""
    if not custom_columns:
        return {}
    alias_to_target = {
        re.sub(r"[^a-z0-9]+", "", alias.lower()): target
        for target, aliases in DEFAULT_SPECIFICATION_FIELD_ALIASES.items()
        for alias in aliases
    }
    mapped: dict[str, str] = {}
    for column in custom_columns:
        name = str(column.get("name") or "").strip()
        target = alias_to_target.get(re.sub(r"[^a-z0-9]+", "", name.lower()))
        if name and target and clean_schedule_value(targets.get(target)):
            mapped[name] = targets[target]
    return mapped


def fill_remaining_custom_columns(
    custom_fields: dict[str, str],
    spec_text: str,
    api_key: str,
    custom_columns: list[dict] | None,
) -> dict[str, str]:
    # Default specification columns were already filled from the structured
    # data; if a value is missing there the page simply does not have it, so
    # only user-defined AI columns are sent to the model (keeps imports fast).
    default_aliases = {
        re.sub(r"[^a-z0-9]+", "", alias.lower())
        for aliases in DEFAULT_SPECIFICATION_FIELD_ALIASES.values()
        for alias in aliases
    } | {re.sub(r"[^a-z0-9]+", "", target.lower()) for target in DEFAULT_SPECIFICATION_FIELD_ALIASES}
    remaining = [
        column
        for column in (custom_columns or [])
        if not clean_schedule_value(custom_fields.get(str(column.get("name") or "")))
        and re.sub(r"[^a-z0-9]+", "", str(column.get("name") or "").lower()) not in default_aliases
    ]
    if not remaining or not api_key:
        return custom_fields
    try:
        ai_result = extract_custom_fields_with_llm([], spec_text, api_key, remaining)
    except Exception as exc:
        print("Web custom-column AI skipped:", f"{type(exc).__name__}: {exc}")
        return custom_fields
    merged = dict(custom_fields)
    for key, value in (ai_result.get("custom_fields") or {}).items():
        if clean_schedule_value(value) and not clean_schedule_value(merged.get(key)):
            merged[key] = value
    return merged


# ---------------------------------------------------------------------------
# iGuzzini adapter
# ---------------------------------------------------------------------------

def _attr_json(page_html: str, attribute: str) -> object:
    match = re.search(rf"{re.escape(attribute)}=([\"'])(.*?)\1", page_html, flags=re.S)
    if not match:
        return None
    return load_json_loose(match.group(2))


def _colour_lookup(colour_block: object) -> dict[str, str]:
    lookup: dict[str, str] = {}
    if not isinstance(colour_block, dict):
        return lookup
    for group in colour_block.get("colours") or []:
        for colour in (group or {}).get("colours") or []:
            code = str(colour.get("code") or "").strip()
            if code and colour.get("description"):
                lookup[code] = str(colour["description"]).strip()
    return lookup


def _num(value: object) -> str:
    if value in (None, "", "None"):
        return ""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value).strip()
    if number == 0:
        return ""
    return f"{number:g}"


def parse_iguzzini_page(page_html: str, url: str) -> Optional[dict]:
    host = (urlparse(url).hostname or "").lower()
    if not host.endswith("iguzzini.com"):
        return None
    combination = _attr_json(page_html, "data-dc-dna-product-code-combination")
    if not isinstance(combination, dict):
        return None
    current = combination.get("currentDnaDoc") or {}
    doc = current.get("dnaCodeDocument") or {}
    if not doc:
        return None

    colours = _attr_json(page_html, "data-dc-dna-product-code-colours") or {}
    body_lookup = _colour_lookup(colours.get("productColours") if isinstance(colours, dict) else None)
    optic_lookup = _colour_lookup(colours.get("opticColours") if isinstance(colours, dict) else None)
    body_colour = body_lookup.get(str(doc.get("finishingBody") or ""), "")
    optic_colour = optic_lookup.get(str(doc.get("finishingOptic") or ""), "")
    if body_colour and optic_colour and body_colour != optic_colour:
        colour = f"{body_colour} body, {optic_colour} optic"
    else:
        colour = body_colour or optic_colour

    presentation = re.sub(r"\s+", " ", str(doc.get("presentationDescription") or "")).strip()
    line_name = presentation.split(" - ")[0].strip() if presentation else ""
    if not line_name:
        line_name = str(doc.get("productLineNameLowerCaseFF") or "").title()
    optic_name = str(doc.get("opticFF") or current.get("opticBeamFF") or "").strip()
    product = line_name
    if optic_name and optic_name.lower() not in line_name.lower():
        product = f"{line_name} {optic_name}".strip()

    mounting = str(current.get("mountingAttribute") or "").strip()
    cct = str(doc.get("colourTemperatureString") or "").replace(" ", "")
    if not cct and doc.get("lightColour"):
        cct = f"{doc['lightColour']}K"
    system_power = _num(doc.get("systemPower")) or _num(doc.get("productPower")) or _num(doc.get("power"))
    ip_parts = [
        str((current.get(key) or {}).get("description") or "").strip()
        for key in ("ipProtection1Attribute", "ipProtection2Attribute")
        if isinstance(current.get(key), dict)
    ]
    ip_rating = ", ".join(part for part in ip_parts if part)
    dimming = str(current.get("protocolAttributeString") or doc.get("controlFF") or "").strip()
    ik_attr = current.get("ikProtectionAttribute")
    ik_value = str((ik_attr or {}).get("description") or "").strip() if isinstance(ik_attr, dict) else ""

    metadata = {
        "type": f"{mounting} luminaire" if mounting else "",
        "manufacturer": "iGuzzini",
        "product": product,
        "spec_code": str(doc.get("igConfigureId") or "").strip(),
        "description": presentation,
        "colour": colour,
        "cct": cct,
        "cri": _num(doc.get("colourRenderingIndex")) or str(doc.get("cri") or "").replace("CR", ""),
        "unit_watts": f"{system_power}W" if system_power else "",
        "dimming": dimming,
        "quantity": "1",
        "ip_rating": ip_rating,
    }

    flux = _num(doc.get("emittedLuminousFlux"))
    weight = _num(doc.get("netWeight"))
    dims = str(current.get("dimensionsString") or doc.get("diameterSizeFF") or "").strip()
    technical_description = re.sub(r"\s+", " ", str(doc.get("technicalDescription") or "")).strip()
    installation_description = re.sub(r"\s+", " ", str(doc.get("installationDescription") or "")).strip()
    isolation = current.get("isolationClassAttribute")
    insulation_class = str(isolation.get("description") or "") if isinstance(isolation, dict) else ""
    spec_lines = [
        f"Product code: {metadata['spec_code']}",
        f"Product: {product}",
        f"Description: {presentation}",
        f"Technical description: {technical_description}",
        f"Installation: {installation_description}",
        f"Light source: {doc.get('zvei') or 'LED'}",
        f"Number of LEDs: {_num(doc.get('nLed'))}",
        f"MacAdam Step: {_num(doc.get('macAdam'))}",
        f"Delivered Lumens: {flux} lm" if flux else "",
        f"Luminous efficiency: {_num(doc.get('luminousEfficiency'))} lm/W",
        f"System power: {system_power} W" if system_power else "",
        f"Colour temperature: {cct}",
        f"Colour quality: {current.get('lightColourQuality') or ''}",
        f"Beam / Distribution: {optic_name}",
        f"LED Lifetime: {doc.get('lifetime1') or ''}",
        f"Input Voltage: {current.get('voltageAttribute') or ''}",
        f"Control: {dimming}",
        f"Insulation class: {insulation_class}",
        f"IP rating: {ip_rating}",
        f"IK rating: {ik_value}",
        f"Weight: {weight} kg" if weight else "",
        f"Dimensions: {dims} mm" if dims else "",
        f"Mounting: {mounting}",
        f"Installation environment: {current.get('installationEnvironmentString') or ''}",
        f"Ambient Temperature: {current.get('ambientTemperatureRange') or ''}",
        f"Glare index: {doc.get('glareIndex') or ''}",
        f"Power factor: {_num(doc.get('powerFactor'))}",
        f"Input current: {_num(doc.get('inputCurrent'))} A",
        f"Colour: {colour}",
        f"Notes: {doc.get('note') or ''}",
    ]
    spec_text = "\n".join(
        line for line in spec_lines if line and not re.search(r":\s*(?:lm|lm/W|W|A|kg|mm)?\s*$", line)
    )

    targets = extract_default_specification_fields_from_text(spec_text, None)
    if optic_name:
        targets["Beam / Distribution"] = optic_name
    if ik_value:
        targets["IK Rating"] = ik_value

    image_widget = _attr_json(page_html, "data-dc-dna-product-code-image")
    product_image_url = str(doc.get("defaultImageFF") or "")
    if not product_image_url and isinstance(image_widget, dict):
        product_image_url = str((image_widget.get("image") or {}).get("src") or "")
    diagram_url = str(doc.get("drawingImageFF") or "")
    polar_url = ""
    for chart in current.get("chartImages") or []:
        if isinstance(chart, dict) and str(chart.get("imageType") or "").upper().startswith("P") and chart.get("url"):
            polar_url = str(chart["url"])
            break

    return {
        "metadata": metadata,
        "targets": targets,
        "spec_text": spec_text,
        "image_urls": {"product": product_image_url, "diagram": diagram_url, "polar": polar_url},
        "source_name": metadata["spec_code"] or line_name,
    }


# ---------------------------------------------------------------------------
# Generic pages
# ---------------------------------------------------------------------------

def build_generic_page_text(parser: ProductPageParser, url: str) -> str:
    page_title = re.sub(r"\s+", " ", parser.title).strip()
    header = [
        "Instruction: when the page lists several alternative options for one field "
        "(for example several colour temperatures, wattages, colours or IP ratings), "
        "return all of them separated by ' / ' (e.g. '2700K / 3000K / 4000K').",
        f"Source: manufacturer product web page {url}",
        f"Page title: {page_title}",
        f"Main heading: {parser.h1}",
        f"Meta description: {parser.meta.get('og:description') or parser.meta.get('description') or ''}",
    ]
    sections = ["\n".join(line for line in header if not line.endswith(": "))]
    if parser.table_lines:
        sections.append("Specification tables:\n" + "\n".join(dict.fromkeys(parser.table_lines)))

    structured: list[str] = []
    for raw in parser.json_scripts:
        data = load_json_loose(raw)
        if data is not None:
            structured.extend(flatten_json(data, limit=300))
    page_body = visible_text(parser)
    sections.append("Page text:\n" + page_body)
    attribute_lines: list[str] = []
    for _, raw in parser.json_attributes:
        data = load_json_loose(raw)
        if data is not None:
            attribute_lines.extend(flatten_json(data, limit=300))
    if structured:
        sections.append("Structured product data:\n" + "\n".join(dict.fromkeys(structured)))
    if attribute_lines:
        sections.append("Embedded page data:\n" + "\n".join(dict.fromkeys(attribute_lines)))
    return "\n\n".join(sections)[:MAX_PAGE_TEXT_CHARS]


def generic_image_urls(parser: ProductPageParser, base_url: str) -> list[str]:
    urls: list[str] = []
    for key in ("og:image", "og:image:url", "twitter:image"):
        if parser.meta.get(key):
            urls.append(parser.meta[key])
    for raw in parser.json_scripts:
        data = load_json_loose(raw)
        stack = [data]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                image = item.get("image")
                if isinstance(image, str):
                    urls.append(image)
                elif isinstance(image, list):
                    urls.extend(str(entry.get("url") if isinstance(entry, dict) else entry) for entry in image[:4])
                elif isinstance(image, dict) and image.get("url"):
                    urls.append(str(image["url"]))
                stack.extend(value for value in item.values() if isinstance(value, (dict, list)))
            elif isinstance(item, list):
                stack.extend(item)
    for image in parser.images:
        if image["in_chrome"]:
            continue
        src = image["src"]
        if NOISE_IMAGE_PATTERN.search(src) or NOISE_IMAGE_PATTERN.search(image.get("alt") or ""):
            continue
        if re.search(r"\.(svg|gif|ico)(?:$|\?)", src, flags=re.I):
            continue
        try:
            if image.get("width") and int(re.sub(r"\D", "", image["width"]) or 0) < 120:
                continue
        except ValueError:
            pass
        urls.append(src)
    resolved: list[str] = []
    for value in urls:
        absolute = urljoin(base_url, html_lib.unescape(str(value).strip()))
        if absolute.startswith(("http://", "https://")) and absolute not in resolved:
            resolved.append(absolute)
    return resolved[:MAX_GENERIC_IMAGES]


DATASHEET_LINK_PATTERN = re.compile(
    r"data\s*-?\s*sheet|spec(?:ification)?\s*-?\s*sheet|product\s*-?\s*sheet|technical\s*-?\s*sheet|"
    r"tech\s*sheet|scheda|fiche|datenblatt|ficha",
    re.I,
)
DATASHEET_EXCLUDE_PATTERN = re.compile(
    r"accessib|privacy|terms|cookie|catalog|brochure|policy|warranty|certific|declaration|"
    r"install|instruction|manual|conformity|\bce\b|enec|ukca|price|press",
    re.I,
)


def linked_datasheet_urls(parser: ProductPageParser, base_url: str) -> list[str]:
    scored: list[tuple[int, str]] = []
    for link in parser.links:
        href = html_lib.unescape(link.get("href") or "").strip()
        if not href or href.startswith(("#", "mailto:", "javascript:", "tel:")):
            continue
        text = link.get("text") or ""
        absolute = urljoin(base_url, href)
        haystack = f"{text} {absolute}"
        if DATASHEET_EXCLUDE_PATTERN.search(haystack):
            continue
        score = 0
        if re.search(r"\.pdf(?:$|[?#])", absolute, flags=re.I):
            score += 2
        if DATASHEET_LINK_PATTERN.search(haystack):
            score += 3
        if link.get("in_chrome"):
            score -= 2
        if score >= 2:
            scored.append((score, absolute))
    scored.sort(key=lambda item: -item[0])
    return list(dict.fromkeys(url for _, url in scored))[:3]


def is_complete(metadata: dict) -> bool:
    populated = sum(1 for value in metadata.values() if clean_schedule_value(value))
    has_identity = clean_schedule_value(metadata.get("product")) or clean_schedule_value(metadata.get("spec_code"))
    return bool(has_identity) and populated >= 5


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def process_luminaire_webpage(
    url: str,
    page_html: str,
    final_url: str,
    api_key: str,
    custom_columns: list[dict] | None,
    save_pdf: Callable[[bytes, str], tuple[Path, str]],
) -> dict:
    """Return the same result shape as process_luminaire_document plus
    'source_type', 'source_name' and 'stored_document'."""
    started = time.perf_counter()
    work_dir = TEMP_ROOT / f"web_{uuid.uuid4().hex}"
    work_dir.mkdir(parents=True, exist_ok=True)
    try:
        parser = parse_page(page_html)

        adapter = parse_iguzzini_page(page_html, final_url)
        if adapter and is_complete(adapter["metadata"]):
            image_paths = download_images_parallel(
                [(key, value) for key, value in adapter["image_urls"].items() if value],
                work_dir,
            )
            custom_fields = map_specification_targets(adapter["targets"], custom_columns)
            custom_fields = fill_remaining_custom_columns(custom_fields, adapter["spec_text"], api_key, custom_columns)
            print("Web extraction accepted:", {
                "method": "iguzzini_embedded_json",
                "spec_code": adapter["metadata"].get("spec_code"),
                "images": {key: bool(value) for key, value in image_paths.items()},
                "elapsed": round(time.perf_counter() - started, 3),
            })
            return {
                "metadata": adapter["metadata"],
                "custom_fields": custom_fields,
                "product_image_path": image_paths.get("product"),
                "diagram_image_path": image_paths.get("diagram"),
                "polar_image_path": image_paths.get("polar"),
                "temp_dir": str(work_dir),
                "source_type": "webpage",
                "source_name": adapter["source_name"],
                "stored_document": "",
            }

        page_text = build_generic_page_text(parser, final_url)
        image_urls = generic_image_urls(parser, final_url)
        downloaded = download_images_parallel(
            [(f"web{index}", image_url) for index, image_url in enumerate(image_urls)],
            work_dir,
        )
        candidate_paths = [path for path in downloaded.values() if path]

        metadata: dict = {}
        custom_fields: dict = {}
        product_image = diagram_image = polar_image = None
        if len(page_text) > 300 and api_key:
            llm_result = extract_with_llm(candidate_paths, page_text, api_key, custom_columns or [])
            metadata = dict(llm_result.get("metadata") or {})
            custom_fields = dict(llm_result.get("custom_fields") or {})
            product_image = match_candidate(candidate_paths, llm_result.get("product_image_filename"))
            diagram_image = match_candidate(candidate_paths, llm_result.get("diagram_image_filename"))
            polar_image = match_candidate(candidate_paths, llm_result.get("polar_image_filename"))

        if is_complete(metadata):
            if not clean_schedule_value(metadata.get("quantity")):
                metadata["quantity"] = "1"
            deterministic = extract_default_specification_fields_from_text(page_text, custom_columns)
            for key, value in deterministic.items():
                if not clean_schedule_value(custom_fields.get(key)):
                    custom_fields[key] = value
            title = clean_schedule_value(metadata.get("spec_code")) or clean_schedule_value(metadata.get("product")) or final_url
            print("Web extraction accepted:", {
                "method": "generic_page_ai",
                "images": len(candidate_paths),
                "text_chars": len(page_text),
                "elapsed": round(time.perf_counter() - started, 3),
            })
            return {
                "metadata": metadata,
                "custom_fields": custom_fields,
                "product_image_path": product_image,
                "diagram_image_path": diagram_image,
                "polar_image_path": polar_image,
                "temp_dir": str(work_dir),
                "source_type": "webpage",
                "source_name": title,
                "stored_document": "",
            }

        # Fallback: a datasheet PDF linked from the page.
        for pdf_url in linked_datasheet_urls(parser, final_url):
            try:
                response, content, pdf_final = safe_get(pdf_url, max_bytes=MAX_PDF_BYTES)
            except Exception as exc:
                print("Linked datasheet skipped:", pdf_url[:160], f"{type(exc).__name__}: {exc}")
                continue
            if not looks_like_pdf(content, response.headers.get("content-type", ""), pdf_final):
                continue
            saved_path, stored_document = save_pdf(content, pdf_final)
            try:
                result = process_luminaire_document(str(saved_path), api_key=api_key, custom_columns=custom_columns)
            except Exception:
                saved_path.unlink(missing_ok=True)
                raise
            shutil.rmtree(work_dir, ignore_errors=True)
            print("Web extraction accepted:", {
                "method": "linked_datasheet_pdf",
                "pdf": pdf_final[:160],
                "elapsed": round(time.perf_counter() - started, 3),
            })
            result["source_type"] = "url"
            result["source_name"] = Path(urlparse(pdf_final).path).name or pdf_final
            result["source_document_url"] = pdf_final
            result["stored_document"] = stored_document
            return result

        raise ValueError(
            "Could not read luminaire details from this web page. "
            "Please paste the product's datasheet PDF link or upload the PDF."
        )
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
