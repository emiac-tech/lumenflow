from __future__ import annotations

import json
import os
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from extract_images import process_luminaire_document
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, LETTER
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas
from datetime import datetime
from sqlalchemy import JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DATA_DIR = BASE_DIR / "data"
DOCUMENTS_DIR = DATA_DIR / "documents"
PRODUCT_IMAGES_DIR = DATA_DIR / "images" / "products"
DIAGRAM_IMAGES_DIR = DATA_DIR / "images" / "diagrams"
DESIGNER_IMAGES_DIR = DATA_DIR / "images" / "designer"
EXPORTS_DIR = DATA_DIR / "exports"

for folder in [DATA_DIR, DOCUMENTS_DIR, PRODUCT_IMAGES_DIR, DIAGRAM_IMAGES_DIR, DESIGNER_IMAGES_DIR, EXPORTS_DIR]:
    folder.mkdir(parents=True, exist_ok=True)


DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'luminaire.db'}")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class Luminaire(Base):
    __tablename__ = "luminaires"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source_type: Mapped[str]
    source_name: Mapped[str]
    source_url: Mapped[Optional[str]]
    document_path: Mapped[str]
    type_code: Mapped[Optional[str]]
    manufacturer: Mapped[Optional[str]]
    product_name: Mapped[Optional[str]]
    spec_code: Mapped[Optional[str]]
    description: Mapped[Optional[str]]
    colour: Mapped[Optional[str]]
    cct: Mapped[Optional[str]]
    cri: Mapped[Optional[str]]
    unit_watts: Mapped[Optional[str]]
    dimming: Mapped[Optional[str]]
    quantity: Mapped[Optional[str]]
    ip_rating: Mapped[Optional[str]]
    total_watts: Mapped[Optional[str]]
    diagram_image_path: Mapped[Optional[str]]
    product_image_path: Mapped[Optional[str]]
    custom_data: Mapped[Optional[str]] = mapped_column(default="{}")
    pdf_template: Mapped[Optional[str]] = mapped_column(default="modern")
    templates: Mapped[List["DesignTemplate"]] = relationship(back_populates="luminaire", cascade="all, delete-orphan")
    exports: Mapped[List["GeneratedDocument"]] = relationship(back_populates="luminaire", cascade="all, delete-orphan")

class DesignTemplate(Base):
    __tablename__ = "design_templates"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    luminaire_id: Mapped[int] = mapped_column(ForeignKey("luminaires.id"), index=True)
    name: Mapped[str]
    page_size: Mapped[str] = mapped_column(default="A4")
    page_width: Mapped[int] = mapped_column(default=794)
    page_height: Mapped[int] = mapped_column(default=1123)
    design_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    luminaire: Mapped[Luminaire] = relationship(back_populates="templates")
    exports: Mapped[List["GeneratedDocument"]] = relationship(back_populates="template", cascade="all, delete-orphan")

class GeneratedDocument(Base):
    __tablename__ = "generated_documents"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    luminaire_id: Mapped[int] = mapped_column(ForeignKey("luminaires.id"), index=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("design_templates.id"), index=True)
    title: Mapped[str]
    file_path: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    luminaire: Mapped[Luminaire] = relationship(back_populates="exports")
    template: Mapped[DesignTemplate] = relationship(back_populates="exports")

class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[Optional[str]]
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CustomColumn(Base):
    __tablename__ = "custom_columns"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Automatically add custom_data and pdf_template if older table formulation
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE luminaires ADD COLUMN custom_data TEXT DEFAULT '{}'"))
            conn.commit()
        except Exception:
            conn.rollback()
        try:
            conn.execute(text("ALTER TABLE luminaires ADD COLUMN pdf_template TEXT DEFAULT 'modern'"))
            conn.commit()
        except Exception:
            conn.rollback()
    yield


app = FastAPI(title="Luminaire Manager", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=str(DATA_DIR)), name="files")


def get_db() -> Session:
    return SessionLocal()


def to_public_file_url(relative_path: Optional[str]) -> Optional[str]:
    if not relative_path:
        return None
    return f"/files/{relative_path.replace(os.sep, '/')}"


def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.get(AppSetting, key)
    return row.value if row and row.value else default


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if not row:
        row = AppSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
        row.updated_at = datetime.utcnow()

# --- PDF Export Utilities ---
def hex_to_reportlab(color: Optional[str], fallback=colors.transparent):
    if not color: return fallback
    val = color.strip().lstrip("#")
    if len(val) == 3: val = "".join(c*2 for c in val)
    if len(val) != 6: return fallback
    try: return colors.HexColor(f"#{val}")
    except: return fallback

def get_internal_file_path(url: Optional[str]) -> Optional[Path]:
    if not url or not url.startswith("/files/"): return None
    return DATA_DIR / url.removeprefix("/files/")

def resolve_asset_url(db: Session, row: Luminaire, attr_name: str) -> str:
    path = getattr(row, attr_name)
    if path and (DATA_DIR / path).exists(): return to_public_file_url(path)
    return ""

def designer_context_from_luminaire(db: Session, row: Luminaire) -> dict:
    payload = serialize_luminaire(row)
    return {
        **payload,
        "productImageUrl": resolve_asset_url(db, row, "product_image_path"),
        "diagramImageUrl": resolve_asset_url(db, row, "diagram_image_path"),
    }

def page_dimensions(page_size: str, width: int, height: int) -> tuple[float, float]:
    if page_size == "LETTER": return LETTER
    if page_size == "CUSTOM": return float(width), float(height)
    return A4

def render_text_item(pdf: canvas.Canvas, item: dict, value: str, page_height: float):
    x, y = float(item.get("x", 0)), page_height - float(item.get("y", 0)) - float(item.get("height", 0))
    w, h = float(item.get("width", 180)), float(item.get("height", 50))
    style = item.get("style", {})
    font = "Helvetica-Bold" if style.get("fontWeight") == "bold" else "Helvetica"
    size = int(style.get("fontSize", 12))
    pdf.setFillColor(hex_to_reportlab(style.get("backgroundColor"), colors.transparent))
    pdf.rect(x, y, w, h, stroke=0, fill=1)
    bc = hex_to_reportlab(style.get("borderColor"), colors.transparent)
    bw = float(style.get("borderWidth", 0))
    if bc != colors.transparent and bw > 0:
        pdf.setStrokeColor(bc)
        pdf.setLineWidth(bw)
        pdf.rect(x, y, w, h, stroke=1, fill=0)
    pdf.setFillColor(hex_to_reportlab(style.get("color"), colors.black))
    pdf.setFont(font, size)
    pad = int(style.get("padding", 6))
    lines = simpleSplit(str(value or ""), font, size, max(20, w - (pad * 2)))
    baseline = y + h - pad - size
    for line in lines[: max(1, int(h // (size + 2)))]:
        pdf.drawString(x + pad, baseline, line)
        baseline -= (size + 2)

def render_image_item(pdf: canvas.Canvas, item: dict, img_path: Optional[Path], page_height: float):
    if not img_path or not img_path.exists(): return
    x, y = float(item.get("x", 0)), page_height - float(item.get("y", 0)) - float(item.get("height", 120))
    w, h = float(item.get("width", 120)), float(item.get("height", 120))
    pdf.drawImage(ImageReader(str(img_path)), x, y, width=w, height=h, preserveAspectRatio=True, mask="auto")

def create_pdf_export(db: Session, row: Luminaire, template: DesignTemplate) -> str:
    pw, ph = page_dimensions(template.page_size, template.page_width, template.page_height)
    name = f"{uuid.uuid4().hex}.pdf"
    rel = f"exports/{name}"
    pdf = canvas.Canvas(str(EXPORTS_DIR / name), pagesize=(pw, ph))
    data = designer_context_from_luminaire(db, row)
    items = (template.design_json or {}).get("items", [])
    for item in items:
        it = item.get("type")
        if it in {"field", "text"}:
            val = data.get(item.get("bindingKey", ""), "") if it == "field" else item.get("text", "")
            render_text_item(pdf, item, val, ph)
        elif it == "image":
            ip = get_internal_file_path(item.get("imageUrl") or data.get(item.get("bindingKey", ""), ""))
            render_image_item(pdf, item, ip, ph)
        elif it in {"shape", "line"}:
            x, y = float(item.get("x", 0)), ph - float(item.get("y", 0)) - float(item.get("height", 20))
            w, h = float(item.get("width", 100)), float(item.get("height", 20))
            style = item.get("style", {})
            pdf.setFillColor(hex_to_reportlab(style.get("backgroundColor"), colors.transparent))
            pdf.rect(x, y, w, h, stroke=0, fill=1)
            bc = hex_to_reportlab(style.get("borderColor"), colors.transparent)
            bw = float(style.get("borderWidth", 0))
            if bc != colors.transparent and bw > 0:
                pdf.setStrokeColor(bc)
                pdf.setLineWidth(bw)
                pdf.rect(x, y, w, h, stroke=1, fill=0)
    pdf.showPage()
    pdf.save()
    return rel

def serialize_template(row: DesignTemplate) -> dict:
    design = row.design_json
    if isinstance(design, str):
        try: design = json.loads(design)
        except: design = {"items": []}
    return {
        "id": row.id,
        "sampleLuminaireId": row.luminaire_id,
        "name": row.name,
        "pageSize": row.page_size,
        "pageWidth": row.page_width,
        "pageHeight": row.page_height,
        "designJson": design,
        "updatedAt": row.updated_at.isoformat()
    }

def serialize_generated_document(row: GeneratedDocument) -> dict:
    return {
        "id": row.id,
        "fileUrl": to_public_file_url(row.file_path),
        "title": row.title,
        "createdAt": row.created_at.isoformat()
    }



def serialize_luminaire(row: Luminaire) -> dict:
    custom = {}
    if row.custom_data:
        try:
            custom = json.loads(row.custom_data)
        except Exception:
            pass

    return {
        "id": row.id,
        "sourceType": row.source_type,
        "sourceName": row.source_name,
        "sourceUrl": row.source_url,
        "documentUrl": to_public_file_url(row.document_path),
        "type": row.type_code,
        "manufacturer": row.manufacturer,
        "product": row.product_name,
        "specCode": row.spec_code,
        "description": row.description,
        "colour": row.colour,
        "cct": row.cct,
        "cri": row.cri,
        "unitWatts": row.unit_watts,
        "dimming": row.dimming,
        "quantity": row.quantity,
        "ipRating": row.ip_rating,
        "totalWatts": row.total_watts,
        "diagramImageUrl": to_public_file_url(row.diagram_image_path),
        "productImageUrl": to_public_file_url(row.product_image_path),
        "customData": custom,
        "pdfTemplate": row.pdf_template,
    }


def save_upload(file: UploadFile) -> tuple[Path, str]:
    extension = Path(file.filename or "document.pdf").suffix or ".pdf"
    unique_name = f"{uuid.uuid4().hex}{extension}"
    target_path = DOCUMENTS_DIR / unique_name
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return target_path, f"documents/{unique_name}"


def download_pdf(url: str) -> tuple[Path, str]:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    is_pdf = "application/pdf" in response.headers.get("content-type", "").lower() or url.lower().endswith(".pdf")
    if not is_pdf:
        raise HTTPException(status_code=400, detail=f"URL does not look like a PDF: {url}")

    extension = Path(url).suffix or ".pdf"
    unique_name = f"{uuid.uuid4().hex}{extension}"
    target_path = DOCUMENTS_DIR / unique_name
    target_path.write_bytes(response.content)
    return target_path, f"documents/{unique_name}"


def save_extracted_asset(temp_path: Optional[str], destination_dir: Path, folder_name: str) -> Optional[str]:
    if not temp_path:
        return None
    source_path = Path(temp_path)
    if not source_path.exists():
        return None
    new_name = f"{uuid.uuid4().hex}{source_path.suffix.lower() or '.png'}"
    final_path = destination_dir / new_name
    shutil.move(str(source_path), final_path)
    return f"images/{folder_name}/{new_name}"


@app.get("/")
async def index():
    return {"status": "ok", "message": "Luminaire API is running."}


@app.get("/api/columns")
def list_columns():
    with get_db() as db:
        rows = db.query(CustomColumn).all()
        return [{"id": r.id, "name": r.name} for r in rows]

@app.post("/api/columns")
async def create_column(request: Request):
    data = await request.json()
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    with get_db() as db:
        exist = db.query(CustomColumn).filter(CustomColumn.name == name).first()
        if exist:
            return {"id": exist.id, "name": exist.name}
        new_col = CustomColumn(name=name)
        db.add(new_col)
        db.commit()
        return {"id": new_col.id, "name": new_col.name}

@app.delete("/api/columns/{column_id}")
def delete_column(column_id: int):
    with get_db() as db:
        col = db.query(CustomColumn).filter(CustomColumn.id == column_id).first()
        if not col:
            raise HTTPException(status_code=404, detail="Not found")
        db.delete(col)
        db.commit()
    return {"status": "ok"}

@app.put("/api/columns/{column_id}")
async def update_column(column_id: int, request: Request):
    data = await request.json()
    new_name = data.get("name", "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name required")
    with get_db() as db:
        col = db.query(CustomColumn).filter(CustomColumn.id == column_id).first()
        if not col:
            raise HTTPException(status_code=404, detail="Not found")
        
        # Keep old custom data name in mind
        old_name = col.name
        
        # update all luminaires' JSON blob to rename the key
        # In a generic situation, we would do a JSON update, but for now we just change the column entity.
        # Ideally, we should update JSON. Let's do it in Python.
        rows_to_update = db.query(Luminaire).all()
        for r in rows_to_update:
            try:
                if r.custom_data:
                    custom = json.loads(r.custom_data)
                    if old_name in custom:
                        custom[new_name] = custom.pop(old_name)
                        r.custom_data = json.dumps(custom)
            except Exception:
                pass
                
        col.name = new_name
        db.commit()
        return {"id": col.id, "name": col.name}


@app.get("/api/luminaires")
def list_luminaires():
    with get_db() as db:
        rows = db.query(Luminaire).order_by(Luminaire.id.asc()).all()
        return {"items": [serialize_luminaire(row) for row in rows]}

@app.post("/api/luminaires")
def create_empty_luminaire():
    with get_db() as db:
        new_row = Luminaire(
            source_type="manual",
            source_name="Manual Entry",
            source_url=None,
            document_path=""
        )
        db.add(new_row)
        db.commit()
        db.refresh(new_row)
        return serialize_luminaire(new_row)

@app.get("/api/luminaires/{item_id}")
def read_luminaire(item_id: int):
    with get_db() as db:
        row = db.query(Luminaire).filter(Luminaire.id == item_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        return serialize_luminaire(row)


@app.delete("/api/luminaires/{item_id}")
def delete_luminaire(item_id: int):
    with get_db() as db:
        row = db.query(Luminaire).filter(Luminaire.id == item_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        db.delete(row)
        db.commit()
    return {"status": "ok"}

@app.put("/api/luminaires/{luminaire_id}")
async def update_luminaire(luminaire_id: int, request: Request):
    data = await request.json()
    with get_db() as db:
        row = db.query(Luminaire).filter(Luminaire.id == luminaire_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Luminaire not found")
        
        # update fields
        if "manufacturer" in data: row.manufacturer = data["manufacturer"]
        if "product" in data: row.product_name = data["product"]
        if "specCode" in data: row.spec_code = data["specCode"]
        if "colour" in data: row.colour = data["colour"]
        if "cct" in data: row.cct = data["cct"]
        if "cri" in data: row.cri = data["cri"]
        if "ipRating" in data: row.ip_rating = data["ipRating"]
        if "unitWatts" in data: row.unit_watts = data["unitWatts"]
        if "dimming" in data: row.dimming = data["dimming"]
        if "type" in data: row.type_code = data["type"]
        if "description" in data: row.description = data["description"]
        if "quantity" in data: row.quantity = data["quantity"]
        if "totalWatts" in data: row.total_watts = data["totalWatts"]
        if "pdfTemplate" in data: row.pdf_template = data["pdfTemplate"]
        
        # update customData recursively
        if "customData" in data and isinstance(data["customData"], dict):
            existing_custom = {}
            if row.custom_data:
                try:
                    existing_custom = json.loads(row.custom_data)
                except Exception:
                    pass
            # merge new custom data completely
            row.custom_data = json.dumps({**existing_custom, **data["customData"]})
        
        db.commit()
        return serialize_luminaire(row)


@app.post("/api/luminaires/import")
async def import_luminaires(
    files: List[UploadFile] = File(default=[]),
    urls: str = Form(default="[]"),
    api_key: str = Form(default=""),
):
    submitted_urls = [item.strip() for item in json.loads(urls or "[]") if item.strip()]
    items_count = len(files) + len(submitted_urls)
    if items_count == 0:
        raise HTTPException(status_code=400, detail="Upload at least one PDF or add at least one URL.")
    if items_count > 20:
        raise HTTPException(status_code=400, detail="You can process at most 20 documents at once.")

    with get_db() as db:
        effective_api_key = (api_key or "").strip() or get_setting(db, "openai_api_key")
    
    if not effective_api_key:
        raise HTTPException(status_code=400, detail="Set the OpenAI API key in Configuration or provide it here for this import.")

    created_rows = []
    failures = []

    for upload in files:
        if not (upload.filename or "").lower().endswith(".pdf"):
            failures.append({"source": upload.filename or "upload", "error": "Only PDF uploads are supported."})
            continue

        saved_path = None
        try:
            saved_path, stored_document = save_upload(upload)
            result = process_luminaire_document(str(saved_path), api_key=effective_api_key)
            created_rows.append(("upload", upload.filename or "document.pdf", None, stored_document, result))
        except Exception as exc:
            failures.append({"source": upload.filename or "upload", "error": str(exc)})
            if saved_path and saved_path.exists():
                saved_path.unlink(missing_ok=True)

    for url in submitted_urls:
        saved_path = None
        try:
            saved_path, stored_document = download_pdf(url)
            result = process_luminaire_document(str(saved_path), api_key=effective_api_key)
            created_rows.append(("url", Path(url).name or url, url, stored_document, result))
        except Exception as exc:
            failures.append({"source": url, "error": str(exc)})
            if saved_path and saved_path.exists():
                saved_path.unlink(missing_ok=True)

    persisted = []
    with get_db() as db:
        for source_type, source_name, source_url, stored_document, result in created_rows:
            product_path = save_extracted_asset(result.get("product_image_path"), PRODUCT_IMAGES_DIR, "products")
            diagram_path = save_extracted_asset(result.get("diagram_image_path"), DIAGRAM_IMAGES_DIR, "diagrams")
            metadata = result.get("metadata", {})
            row = Luminaire(
                source_type=source_type,
                source_name=source_name,
                source_url=source_url,
                document_path=stored_document,
                type_code=metadata.get("type") or metadata.get("type_code"),
                manufacturer=metadata.get("manufacturer"),
                product_name=metadata.get("product"),
                spec_code=metadata.get("spec_code"),
                description=metadata.get("description"),
                colour=metadata.get("colour"),
                cct=metadata.get("cct"),
                cri=metadata.get("cri"),
                unit_watts=metadata.get("unit_watts"),
                dimming=metadata.get("dimming"),
                quantity=metadata.get("quantity"),
                ip_rating=metadata.get("ip_rating"),
                total_watts=metadata.get("total_watts"),
                diagram_image_path=diagram_path,
                product_image_path=product_path,
            )
            db.add(row)
            db.flush()
            persisted.append(serialize_luminaire(row))

        db.commit()

    return {
        "created": persisted,
        "failures": failures,
        "summary": {
            "requested": items_count,
            "created": len(persisted),
            "failed": len(failures),
        },
    }

# --- Settings & Designer API ---
@app.get("/api/settings")
def api_get_settings():
    with get_db() as db:
        row = db.get(AppSetting, "openai_api_key")
        return {
            "items": [{
                "key": "openai_api_key",
                "label": "OpenAI API Key",
                "value": "Configured" if row and row.value else "Not set",
                "status": "Active" if row and row.value else "Missing",
                "updatedAt": row.updated_at.isoformat() if row and row.updated_at else "",
            }]
        }

@app.post("/api/settings")
async def api_save_settings(request: Request):
    data = await request.json()
    with get_db() as db:
        key = data.get("openaiApiKey", "").strip()
        set_setting(db, "openai_api_key", key)
        db.commit()
    return {"ok": True}

@app.get("/api/templates")
def api_list_templates():
    with get_db() as db:
        rows = db.query(DesignTemplate).order_by(DesignTemplate.updated_at.desc()).all()
        return {"templates": [serialize_template(r) for r in rows]}

@app.get("/api/templates/{template_id}")
def api_get_template(template_id: int):
    with get_db() as db:
        template = db.query(DesignTemplate).filter(DesignTemplate.id == template_id).first()
        if not template: raise HTTPException(404, "Template not found")
        return {"template": serialize_template(template)}

@app.post("/api/templates")
async def api_create_template(request: Request):
    payload = await request.json()
    with get_db() as db:
        first_lum = db.query(Luminaire).first()
        template = DesignTemplate(
            luminaire_id=first_lum.id if first_lum else 0, 
            name=payload.get("name") or "Untitled",
            page_width=int(payload.get("pageWidth", 595)),
            page_height=int(payload.get("pageHeight", 842)),
            design_json=payload.get("designJson") or {"items": []}
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return {"template": serialize_template(template)}

@app.put("/api/templates/{template_id}")
async def api_update_template(template_id: int, request: Request):
    payload = await request.json()
    with get_db() as db:
        template = db.query(DesignTemplate).filter(DesignTemplate.id == template_id).first()
        if not template: raise HTTPException(404, "Template not found")
        template.name = payload.get("name") or template.name
        if "designJson" in payload:
            template.design_json = payload.get("designJson")
        template.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(template)
        return {"template": serialize_template(template)}

@app.delete("/api/templates/{template_id}")
def api_delete_template(template_id: int):
    with get_db() as db:
        template = db.query(DesignTemplate).filter(DesignTemplate.id == template_id).first()
        if not template: raise HTTPException(404, "Template not found")
        db.delete(template)
        db.commit()
        return {"ok": True}

@app.post("/api/luminaires/{luminaire_id}/templates/{template_id}/export")
def api_export_template(luminaire_id: int, template_id: int):
    with get_db() as db:
        row = db.get(Luminaire, luminaire_id)
        template = db.get(DesignTemplate, template_id)
        if not row or not template: raise HTTPException(404, "Not found")
        rel = create_pdf_export(db, row, template)
        gen = GeneratedDocument(luminaire_id=luminaire_id, template_id=template_id, title=f"{template.name}.pdf", file_path=rel)
        db.add(gen)
        db.commit()
        db.refresh(gen)
        return {"document": serialize_generated_document(gen)}

@app.get("/api/exports")
def api_list_exports():
    with get_db() as db:
        rows = db.query(GeneratedDocument).order_by(GeneratedDocument.created_at.desc()).all()
        return {"items": [serialize_generated_document(r) for r in rows]}

@app.post("/api/luminaires/{luminaire_id}/designer-assets")
async def api_upload_asset(luminaire_id: int, file: UploadFile = File(...)):
    name = f"{luminaire_id}_{uuid.uuid4().hex}{Path(file.filename or '.png').suffix}"
    target = DESIGNER_IMAGES_DIR / name
    with target.open("wb") as b: shutil.copyfileobj(file.file, b)
    return {"imageUrl": to_public_file_url(f"images/designer/{name}"), "fileName": file.filename}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
