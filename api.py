from __future__ import annotations

import json
import os
import shutil
import uuid
from contextlib import asynccontextmanager, contextmanager
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
from datetime import datetime, timedelta
from sqlalchemy import JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi import Depends
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DATA_DIR = BASE_DIR / "data"
DOCUMENTS_DIR = DATA_DIR / "documents"
PRODUCT_IMAGES_DIR = DATA_DIR / "images" / "products"
DIAGRAM_IMAGES_DIR = DATA_DIR / "images" / "diagrams"
POLAR_IMAGES_DIR = DATA_DIR / "images" / "polar"
DESIGNER_IMAGES_DIR = DATA_DIR / "images" / "designer"
EXPORTS_DIR = DATA_DIR / "exports"

for folder in [DATA_DIR, DOCUMENTS_DIR, PRODUCT_IMAGES_DIR, DIAGRAM_IMAGES_DIR, POLAR_IMAGES_DIR, DESIGNER_IMAGES_DIR, EXPORTS_DIR]:
    folder.mkdir(parents=True, exist_ok=True)


DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'luminaire.db'}")
_is_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,           # test connection health before use
    pool_recycle=1800,            # recycle connections after 30 min to avoid SSL EOF from remote DB
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    hashed_password: Mapped[Optional[str]]
    role: Mapped[str] = mapped_column(default="client") # "admin" or "client"
    google_sub: Mapped[Optional[str]] = mapped_column(unique=True, index=True)
    tokens: Mapped[int] = mapped_column(default=0)
    invite_code_id: Mapped[Optional[int]] = mapped_column(ForeignKey("invite_codes.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    projects: Mapped[List["Project"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class InviteCode(Base):
    __tablename__ = "invite_codes"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(unique=True, index=True)
    token_amount: Mapped[int]
    usage_limit: Mapped[int]
    current_usage: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    owner: Mapped[Optional["User"]] = relationship(back_populates="projects")
    luminaires: Mapped[List["Luminaire"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    custom_columns: Mapped[List["CustomColumn"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    templates: Mapped[List["DesignTemplate"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    settings: Mapped[List["AppSetting"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Luminaire(Base):
    __tablename__ = "luminaires"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), index=True)
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
    polar_image_path: Mapped[Optional[str]]
    custom_data: Mapped[Optional[str]] = mapped_column(default="{}")
    pdf_template: Mapped[Optional[str]] = mapped_column(default="modern")
    
    project: Mapped[Project] = relationship(back_populates="luminaires")
    templates: Mapped[List["DesignTemplate"]] = relationship(back_populates="luminaire", cascade="all, delete-orphan")
    exports: Mapped[List["GeneratedDocument"]] = relationship(back_populates="luminaire", cascade="all, delete-orphan")

class DesignTemplate(Base):
    __tablename__ = "design_templates"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), index=True)
    luminaire_id: Mapped[int] = mapped_column(ForeignKey("luminaires.id"), index=True)
    name: Mapped[str]
    page_size: Mapped[str] = mapped_column(default="A4")
    page_width: Mapped[int] = mapped_column(default=794)
    page_height: Mapped[int] = mapped_column(default=1123)
    design_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project: Mapped[Project] = relationship(back_populates="templates")
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
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), index=True)
    key: Mapped[str]
    value: Mapped[Optional[str]]
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project: Mapped[Project] = relationship(back_populates="settings")

class CustomColumn(Base):
    __tablename__ = "custom_columns"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str]
    ai_enabled: Mapped[bool] = mapped_column(default=False)
    ai_description: Mapped[Optional[str]]

    project: Mapped[Project] = relationship(back_populates="custom_columns")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Automatically add custom_data and pdf_template if older table formulation
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE luminaires ADD COLUMN project_id INTEGER REFERENCES projects(id)"))
            conn.commit()
        except Exception:
            conn.rollback()

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
        
        # New multi-project migration
        try:
            conn.execute(text("ALTER TABLE custom_columns ADD COLUMN project_id INTEGER REFERENCES projects(id)"))
            conn.commit()
        except Exception:
            conn.rollback()

        try:
            conn.execute(text("ALTER TABLE custom_columns ADD COLUMN ai_enabled BOOLEAN DEFAULT FALSE"))
            conn.commit()
        except Exception:
            conn.rollback()

        try:
            conn.execute(text("ALTER TABLE custom_columns ADD COLUMN ai_description TEXT"))
            conn.commit()
        except Exception:
            conn.rollback()

        try:
            conn.execute(text("ALTER TABLE design_templates ADD COLUMN project_id INTEGER REFERENCES projects(id)"))
            conn.commit()
        except Exception:
            conn.rollback()

        try:
            # Recreate app_settings if it's the old format (key as PK)
            # This is tricky without alembic, but we can try to add columns
            conn.execute(text("ALTER TABLE app_settings ADD COLUMN id INTEGER"))
            conn.execute(text("ALTER TABLE app_settings ADD COLUMN project_id INTEGER REFERENCES projects(id)"))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add owner_id to projects
        try:
            conn.execute(text("ALTER TABLE projects ADD COLUMN owner_id INTEGER REFERENCES users(id)"))
            conn.commit()
        except Exception:
            conn.rollback()
            
        # Add tokens to users
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN tokens INTEGER DEFAULT 0"))
            conn.commit()
        except Exception:
            conn.rollback()
        
        # Add invite_code_id to users  
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN invite_code_id INTEGER REFERENCES invite_codes(id)"))
            conn.commit()
        except Exception:
            conn.rollback()

        # Add polar_image_path to luminaires
        try:
            conn.execute(text("ALTER TABLE luminaires ADD COLUMN polar_image_path TEXT"))
            conn.commit()
        except Exception:
            conn.rollback()

    # Create default project and associate data
    with SessionLocal() as db:
        # Create a default admin user if none exists so existing data isn't completely orphaned
        default_admin = db.query(User).filter(User.email == "admin@example.com").first()
        if not default_admin:
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            hashed_pw = pwd_context.hash("admin")
            default_admin = User(email="admin@example.com", hashed_password=hashed_pw, role="admin")
            db.add(default_admin)
            db.flush()

        default_project = db.query(Project).filter(Project.name == "Default Project").first()
        if not default_project:
            default_project = Project(name="Default Project", owner_id=default_admin.id)
            db.add(default_project)
            db.flush()
        elif default_project.owner_id is None:
            default_project.owner_id = default_admin.id
            db.flush()
        
        # Ensure all existing projects are assigned to the default admin to avoid orphans
        db.query(Project).filter(Project.owner_id == None).update({Project.owner_id: default_admin.id})

        # Assign orphaned data
        db.query(Luminaire).filter(Luminaire.project_id == None).update({Luminaire.project_id: default_project.id})
        db.query(CustomColumn).filter(CustomColumn.project_id == None).update({CustomColumn.project_id: default_project.id})
        db.query(DesignTemplate).filter(DesignTemplate.project_id == None).update({DesignTemplate.project_id: default_project.id})
        
        # For AppSettings, we only migrate those that are table-specific
        project_keys = [
            "luminaire_column_order", "luminaire_hidden_columns", 
            "luminaire_sort_config", "luminaire_filter_config", 
            "luminaire_column_labels", "luminaire_filter_logic", "luminaire_row_height"
        ]
        db.query(AppSetting).filter(AppSetting.key.in_(project_keys), AppSetting.project_id == None).update({AppSetting.project_id: default_project.id})
        
        # Seed default invite codes if none exist
        if db.query(InviteCode).count() == 0:
            db.add_all([
                InviteCode(code="TRIAL10", token_amount=10, usage_limit=100),
                InviteCode(code="PRO100", token_amount=100, usage_limit=50),
                InviteCode(code="ULTRA1000", token_amount=1000, usage_limit=10)
            ])
        
        db.commit()

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


@contextmanager
def session_scope():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Authentication System ---
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-replace-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "your-google-client-id.apps.googleusercontent.com")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain_password, hashed_password):
    if not hashed_password: return False
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = str(payload.get("sub"))
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user

async def get_admin_user(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not enough privileges")
    return current_user

class SignupRequest(BaseModel):
    email: str
    password: str
    invite_code: str

class GoogleAuthRequest(BaseModel):
    credential: str

@app.post("/api/auth/signup")
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate Invite Code
    invite = db.query(InviteCode).filter(InviteCode.code == request.invite_code, InviteCode.is_active == True).first()
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid invite code")
    
    if invite.current_usage >= invite.usage_limit:
        raise HTTPException(status_code=400, detail="Invite code has expired")
    
    # First user becomes admin
    is_first = db.query(User).count() == 0
    role = "admin" if is_first else "client"
    
    hashed_pass = get_password_hash(request.password)
    new_user = User(
        email=request.email, 
        hashed_password=hashed_pass, 
        role=role,
        tokens=invite.token_amount,
        invite_code_id=invite.id
    )
    db.add(new_user)
    
    # Update invite usage
    invite.current_usage += 1
    
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(
        data={"sub": str(new_user.id), "role": new_user.role},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": new_user.id, "email": new_user.email, "role": new_user.role, "tokens": new_user.tokens}}

@app.post("/api/auth/login")
def login(request: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.username).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user.id, "email": user.email, "role": user.role, "tokens": user.tokens}}

@app.post("/api/auth/google")
def google_auth(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    try:
        idinfo = id_token.verify_oauth2_token(request.credential, google_requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']
        google_sub = idinfo['sub']
        
        user = db.query(User).filter(User.email == email).first()
        if not user:
            is_first = db.query(User).count() == 0
            role = "admin" if is_first else "client"
            user = User(email=email, google_sub=google_sub, role=role)
            db.add(user)
            db.commit()
            db.refresh(user)
        elif not user.google_sub:
            # Link existing account to google
            user.google_sub = google_sub
            db.commit()
            
        access_token = create_access_token(
            data={"sub": str(user.id), "role": user.role},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        return {"access_token": access_token, "token_type": "bearer", "user": {"id": user.id, "email": user.email, "role": user.role, "tokens": user.tokens}}
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google Token")

@app.get("/api/users")
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    users = db.query(User).order_by(User.id.asc()).all()
    result = []
    for u in users:
        invite = db.query(InviteCode).filter(InviteCode.id == u.invite_code_id).first() if u.invite_code_id else None
        result.append({
            "id": u.id,
            "email": u.email,
            "role": u.role,
            "tokens": u.tokens,
            "inviteCode": invite.code if invite else None,
            "inviteCodeId": invite.id if invite else None,
            "inviteTokenAmount": invite.token_amount if invite else None,
            "createdAt": u.created_at.isoformat(),
        })
    return {"users": result}


class UserUpdateBody(BaseModel):
    invite_code_id: Optional[int] = None   # change invite code
    top_up_tokens: Optional[int] = None    # add N tokens to current balance
    set_tokens: Optional[int] = None       # set tokens to exact value

@app.patch("/api/admin/users/{user_id}")
def admin_update_user(
    user_id: int,
    body: UserUpdateBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")

    # Change invite code
    if body.invite_code_id is not None:
        invite = db.query(InviteCode).filter(InviteCode.id == body.invite_code_id).first()
        if not invite:
            raise HTTPException(404, "Invite code not found")
        target.invite_code_id = invite.id

    # Set tokens to exact value
    if body.set_tokens is not None:
        target.tokens = max(0, body.set_tokens)

    # Top up (add to existing balance)
    if body.top_up_tokens is not None:
        target.tokens = max(0, target.tokens + body.top_up_tokens)

    db.commit()
    db.refresh(target)
    invite = db.query(InviteCode).filter(InviteCode.id == target.invite_code_id).first() if target.invite_code_id else None
    return {
        "id": target.id,
        "email": target.email,
        "role": target.role,
        "tokens": target.tokens,
        "inviteCode": invite.code if invite else None,
        "inviteCodeId": invite.id if invite else None,
        "inviteTokenAmount": invite.token_amount if invite else None,
        "createdAt": target.created_at.isoformat(),
    }

@app.get("/api/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id, 
        "email": current_user.email, 
        "role": current_user.role, 
        "tokens": current_user.tokens
    }


# ─── Invite Code Management (Admin Only) ────────────────────────────────────

class InviteCodeCreate(BaseModel):
    code: str
    token_amount: int
    usage_limit: int

class InviteCodeUpdateBody(BaseModel):
    token_amount: Optional[int] = None
    usage_limit: Optional[int] = None
    is_active: Optional[bool] = None

def serialize_invite_code(ic: InviteCode) -> dict:
    return {
        "id": ic.id,
        "code": ic.code,
        "tokenAmount": ic.token_amount,
        "usageLimit": ic.usage_limit,
        "currentUsage": ic.current_usage,
        "isActive": ic.is_active,
        "spotsLeft": ic.usage_limit - ic.current_usage,
    }

@app.get("/api/admin/invite-codes")
def list_invite_codes(db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    codes = db.query(InviteCode).order_by(InviteCode.id.asc()).all()
    return {"codes": [serialize_invite_code(c) for c in codes]}

@app.post("/api/admin/invite-codes")
def create_invite_code(body: InviteCodeCreate, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    existing = db.query(InviteCode).filter(InviteCode.code == body.code.strip().upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Invite code already exists")
    ic = InviteCode(code=body.code.strip().upper(), token_amount=body.token_amount, usage_limit=body.usage_limit)
    db.add(ic)
    db.commit()
    db.refresh(ic)
    return serialize_invite_code(ic)

@app.patch("/api/admin/invite-codes/{code_id}")
def update_invite_code(code_id: int, body: InviteCodeUpdateBody, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    ic = db.query(InviteCode).filter(InviteCode.id == code_id).first()
    if not ic:
        raise HTTPException(status_code=404, detail="Invite code not found")
    if body.token_amount is not None:
        ic.token_amount = body.token_amount
    if body.usage_limit is not None:
        ic.usage_limit = body.usage_limit
    if body.is_active is not None:
        ic.is_active = body.is_active
    db.commit()
    db.refresh(ic)
    return serialize_invite_code(ic)

@app.delete("/api/admin/invite-codes/{code_id}")
def delete_invite_code(code_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_admin_user)):
    ic = db.query(InviteCode).filter(InviteCode.id == code_id).first()
    if not ic:
        raise HTTPException(status_code=404, detail="Invite code not found")
    db.delete(ic)
    db.commit()
    return {"ok": True}


def get_project_or_404(db: Session, project_id: int, current_user: User) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role != "admin" and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return project

def to_public_file_url(relative_path: Optional[str]) -> Optional[str]:
    if not relative_path:
        return None
    return f"/files/{relative_path.replace(os.sep, '/')}"


def get_setting(db: Session, key: str, default: str = "", project_id: Optional[int] = None) -> str:
    query = db.query(AppSetting).filter(AppSetting.key == key)
    if project_id is not None:
        query = query.filter(AppSetting.project_id == project_id)
    else:
        query = query.filter(AppSetting.project_id == None)
    row = query.first()
    return row.value if row and row.value else default


def set_setting(db: Session, key: str, value: str, project_id: Optional[int] = None) -> None:
    query = db.query(AppSetting).filter(AppSetting.key == key)
    if project_id is not None:
        query = query.filter(AppSetting.project_id == project_id)
    else:
        query = query.filter(AppSetting.project_id == None)
    
    row = query.first()
    if not row:
        row = AppSetting(key=key, value=value, project_id=project_id)
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

def serialize_project(row: Project) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "createdAt": row.created_at.isoformat(),
    }

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
        "polarImageUrl": to_public_file_url(row.polar_image_path),
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




def normalize_column_keys(values: List[str]) -> List[str]:
    normalized: List[str] = []
    seen = set()
    for item in values:
        key = str(item).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized


def get_saved_column_order(db: Session, project_id: int) -> List[str]:
    raw = get_setting(db, "luminaire_column_order", "[]", project_id=project_id)
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return normalize_column_keys([str(item) for item in parsed])


def save_column_order_setting(db: Session, order: List[str], project_id: int) -> List[str]:
    normalized = normalize_column_keys(order)
    set_setting(db, "luminaire_column_order", json.dumps(normalized), project_id=project_id)
    return normalized


def get_hidden_columns(db: Session, project_id: int) -> List[str]:
    raw = get_setting(db, "luminaire_hidden_columns", "[]", project_id=project_id)
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return normalize_column_keys([str(item) for item in parsed])


def save_hidden_columns_setting(db: Session, hidden: List[str], project_id: int) -> List[str]:
    normalized = normalize_column_keys(hidden)
    set_setting(db, "luminaire_hidden_columns", json.dumps(normalized), project_id=project_id)
    return normalized


def get_sort_config(db: Session, project_id: int) -> List[dict]:
    raw = get_setting(db, "luminaire_sort_config", "[]", project_id=project_id)
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []

    normalized = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip()
        direction = str(item.get("direction", "asc")).strip().lower()
        if not key:
            continue
        if direction not in {"asc", "desc"}:
            direction = "asc"
        normalized.append({"key": key, "direction": direction})
    return normalized[:1]


def save_sort_config_setting(db: Session, sort_config: List[dict], project_id: int) -> List[dict]:
    normalized = []
    for item in sort_config:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip()
        direction = str(item.get("direction", "asc")).strip().lower()
        if not key:
            continue
        if direction not in {"asc", "desc"}:
            direction = "asc"
        normalized.append({"key": key, "direction": direction})
    normalized = normalized[:1]
    set_setting(db, "luminaire_sort_config", json.dumps(normalized), project_id=project_id)
    return normalized


def get_filter_config(db: Session, project_id: int) -> List[dict]:
    raw = get_setting(db, "luminaire_filter_config", "[]", project_id=project_id)
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []

    allowed_ops = {"contains", "not_contains", "is", "is_not", "is_empty", "is_not_empty", "gt", "lt"}
    normalized = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip()
        operator = str(item.get("operator", "contains")).strip().lower()
        if not key:
            continue
        if operator not in allowed_ops:
            operator = "contains"
        normalized.append({
            "id": str(item.get("id", uuid.uuid4().hex)),
            "key": key,
            "operator": operator,
            "value": str(item.get("value", "")),
        })
    return normalized


def save_filter_config_setting(db: Session, filters: List[dict], project_id: int) -> List[dict]:
    allowed_ops = {"contains", "not_contains", "is", "is_not", "is_empty", "is_not_empty", "gt", "lt"}
    normalized = []
    for item in filters:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip()
        operator = str(item.get("operator", "contains")).strip().lower()
        if not key:
            continue
        if operator not in allowed_ops:
            operator = "contains"
        normalized.append({
            "id": str(item.get("id", uuid.uuid4().hex)),
            "key": key,
            "operator": operator,
            "value": str(item.get("value", "")),
        })
    set_setting(db, "luminaire_filter_config", json.dumps(normalized), project_id=project_id)
    return normalized


def get_column_labels(db: Session, project_id: int) -> dict:
    raw = get_setting(db, "luminaire_column_labels", "{}", project_id=project_id)
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(parsed, dict):
        return {}
    normalized = {}
    for key, value in parsed.items():
        safe_key = str(key).strip()
        safe_value = str(value).strip()
        if safe_key and safe_value:
            normalized[safe_key] = safe_value
    return normalized


def save_column_labels_setting(db: Session, labels: dict, project_id: int) -> dict:
    normalized = {}
    for key, value in labels.items():
        safe_key = str(key).strip()
        safe_value = str(value).strip()
        if safe_key and safe_value:
            normalized[safe_key] = safe_value
    set_setting(db, "luminaire_column_labels", json.dumps(normalized), project_id=project_id)
    return normalized


def serialize_custom_column(row: CustomColumn) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "aiEnabled": bool(row.ai_enabled),
        "aiDescription": row.ai_description or "",
    }


@app.get("/api/projects")
def list_projects(current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        if current_user.role == "admin":
            rows = db.query(Project).order_by(Project.id.asc()).all()
        else:
            rows = db.query(Project).filter(Project.owner_id == current_user.id).order_by(Project.id.asc()).all()
        return {"projects": [serialize_project(r) for r in rows]}


@app.post("/api/projects")
async def create_project(request: Request, current_user: User = Depends(get_current_user)):
    data = await request.json()
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    with session_scope() as db:
        new_project = Project(name=name, owner_id=current_user.id)
        db.add(new_project)
        db.commit()
        db.refresh(new_project)
        return serialize_project(new_project)


@app.put("/api/projects/{project_id}")
async def update_project(project_id: int, request: Request, current_user: User = Depends(get_current_user)):
    data = await request.json()
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    with session_scope() as db:
        project = get_project_or_404(db, project_id, current_user)
        project.name = name
        db.commit()
        db.refresh(project)
        return serialize_project(project)


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        project = get_project_or_404(db, project_id, current_user)
        db.delete(project)
        db.commit()
    return {"status": "ok"}


@app.get("/api/columns")
def list_columns(project_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        rows = db.query(CustomColumn).filter(CustomColumn.project_id == project_id).all()
        saved_order = get_saved_column_order(db, project_id)
        custom_positions = {key: idx for idx, key in enumerate(saved_order) if key.startswith("custom:")}
        rows.sort(key=lambda row: custom_positions.get(f"custom:{row.id}", len(saved_order) + row.id))
        return [serialize_custom_column(r) for r in rows]


@app.get("/api/columns/order")
def get_column_order(project_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        return {
            "order": get_saved_column_order(db, project_id),
            "hidden": get_hidden_columns(db, project_id),
            "sort": get_sort_config(db, project_id),
            "filter": get_filter_config(db, project_id),
            "labels": get_column_labels(db, project_id),
            "filterLogic": get_setting(db, "luminaire_filter_logic", "AND", project_id=project_id),
            "rowHeight": get_setting(db, "luminaire_row_height", "medium", project_id=project_id),
        }


@app.put("/api/columns/order")
async def update_column_order(request: Request, project_id: int, current_user: User = Depends(get_current_user)):
    data = await request.json()
    order = data.get("order", [])
    hidden = data.get("hidden", [])
    sort_config = data.get("sort", [])
    filter_config = data.get("filter", [])
    labels = data.get("labels", {})
    filter_logic = data.get("filterLogic", "AND")
    row_height = data.get("rowHeight", "medium")
    if filter_logic not in ("AND", "OR"):
        filter_logic = "AND"
    if row_height not in ("small", "medium", "large"):
        row_height = "medium"
    if not isinstance(order, list):
        raise HTTPException(status_code=400, detail="Order must be a list")
    if not isinstance(hidden, list):
        raise HTTPException(status_code=400, detail="Hidden must be a list")
    if not isinstance(sort_config, list):
        raise HTTPException(status_code=400, detail="Sort must be a list")
    if not isinstance(filter_config, list):
        raise HTTPException(status_code=400, detail="Filter must be a list")
    if not isinstance(labels, dict):
        raise HTTPException(status_code=400, detail="Labels must be an object")
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        normalized_order = save_column_order_setting(db, [str(item) for item in order], project_id)
        normalized_hidden = save_hidden_columns_setting(db, [str(item) for item in hidden], project_id)
        normalized_sort = save_sort_config_setting(db, sort_config, project_id)
        normalized_filter = save_filter_config_setting(db, filter_config, project_id)
        normalized_labels = save_column_labels_setting(db, labels, project_id)
        set_setting(db, "luminaire_filter_logic", filter_logic, project_id=project_id)
        set_setting(db, "luminaire_row_height", row_height, project_id=project_id)
        db.commit()
        return {
            "order": normalized_order,
            "hidden": normalized_hidden,
            "sort": normalized_sort,
            "filter": normalized_filter,
            "labels": normalized_labels,
            "filterLogic": filter_logic,
            "rowHeight": row_height,
        }


@app.post("/api/columns")
async def create_column(request: Request, project_id: int, current_user: User = Depends(get_current_user)):
    data = await request.json()
    name = data.get("name", "").strip()
    ai_enabled = bool(data.get("aiEnabled", False))
    ai_description = str(data.get("aiDescription", "") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        exist = db.query(CustomColumn).filter(CustomColumn.name == name, CustomColumn.project_id == project_id).first()
        if exist:
            exist.ai_enabled = ai_enabled
            exist.ai_description = ai_description or None
            db.commit()
            db.refresh(exist)
            return serialize_custom_column(exist)
        new_col = CustomColumn(
            name=name,
            project_id=project_id,
            ai_enabled=ai_enabled,
            ai_description=ai_description or None,
        )
        db.add(new_col)
        db.flush()
        saved_order = get_saved_column_order(db, project_id)
        new_key = f"custom:{new_col.id}"
        if new_key not in saved_order:
            saved_order.append(new_key)
        save_column_order_setting(db, saved_order, project_id)
        db.commit()
        db.refresh(new_col)
        return serialize_custom_column(new_col)


@app.delete("/api/columns/{column_id}")
def delete_column(column_id: int, project_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        col = db.query(CustomColumn).filter(CustomColumn.id == column_id, CustomColumn.project_id == project_id).first()
        if not col:
            raise HTTPException(status_code=404, detail="Not found")
        db.delete(col)
        column_key = f"custom:{column_id}"
        save_column_order_setting(db, [key for key in get_saved_column_order(db, project_id) if key != column_key], project_id)
        save_hidden_columns_setting(db, [key for key in get_hidden_columns(db, project_id) if key != column_key], project_id)
        save_sort_config_setting(db, [item for item in get_sort_config(db, project_id) if item.get("key") != column_key], project_id)
        save_filter_config_setting(db, [item for item in get_filter_config(db, project_id) if item.get("key") != column_key], project_id)
        labels = get_column_labels(db, project_id)
        if column_key in labels:
            labels.pop(column_key, None)
            save_column_labels_setting(db, labels, project_id)
        db.commit()
    return {"status": "ok"}


@app.put("/api/columns/{column_id}")
async def update_column(column_id: int, request: Request, current_user: User = Depends(get_current_user)):
    data = await request.json()
    new_name = data.get("name", "").strip()
    ai_enabled = bool(data.get("aiEnabled", False))
    ai_description = str(data.get("aiDescription", "") or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name required")
    with session_scope() as db:
        col = db.query(CustomColumn).filter(CustomColumn.id == column_id).first()
        if not col:
            raise HTTPException(status_code=404, detail="Not found")
        get_project_or_404(db, col.project_id, current_user)

        old_name = col.name
        rows_to_update = db.query(Luminaire).filter(Luminaire.project_id == col.project_id).all()
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
        col.ai_enabled = ai_enabled
        col.ai_description = ai_description or None
        db.commit()
        db.refresh(col)
        return serialize_custom_column(col)


@app.get("/api/luminaires")
def list_luminaires(project_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        rows = db.query(Luminaire).filter(Luminaire.project_id == project_id).order_by(Luminaire.id.asc()).all()
        return {"items": [serialize_luminaire(row) for row in rows]}


@app.post("/api/luminaires")
def create_empty_luminaire(project_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        new_row = Luminaire(
            project_id=project_id,
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
def read_luminaire(item_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        row = db.query(Luminaire).filter(Luminaire.id == item_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        get_project_or_404(db, row.project_id, current_user)
        return serialize_luminaire(row)


@app.delete("/api/luminaires/{item_id}")
def delete_luminaire(item_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        row = db.query(Luminaire).filter(Luminaire.id == item_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        get_project_or_404(db, row.project_id, current_user)
        db.delete(row)
        db.commit()
    return {"status": "ok"}

@app.put("/api/luminaires/{luminaire_id}")
async def update_luminaire(luminaire_id: int, request: Request, current_user: User = Depends(get_current_user)):
    data = await request.json()
    with session_scope() as db:
        row = db.query(Luminaire).filter(Luminaire.id == luminaire_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Luminaire not found")
        get_project_or_404(db, row.project_id, current_user)
        
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
        if "productImageUrl" in data: 
            val = data["productImageUrl"]
            row.product_image_path = val.replace("/files/", "") if val and val.startswith("/files/") else val
        if "diagramImageUrl" in data:
            val = data["diagramImageUrl"]
            row.diagram_image_path = val.replace("/files/", "") if val and val.startswith("/files/") else val
        
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
    project_id: int,
    files: List[UploadFile] = File(default=[]),
    urls: str = Form(default="[]"),
    api_key: str = Form(default=""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    submitted_urls = [item.strip() for item in json.loads(urls or "[]") if item.strip()]
    items_count = len(files) + len(submitted_urls)
    if items_count == 0:
        raise HTTPException(status_code=400, detail="Upload at least one PDF or add at least one URL.")
    if items_count > 20:
        raise HTTPException(status_code=400, detail="You can process at most 20 documents at once.")

    # ── Token Check (admin is exempt) ──
    if current_user.role != "admin":
        if current_user.tokens <= 0:
            raise HTTPException(
                status_code=403,
                detail="Insufficient credits. You have 0 credits remaining. Please contact your administrator."
            )
        if current_user.tokens < items_count:
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient credits. You have {current_user.tokens} credit(s) but are trying to import {items_count} PDF(s). Please reduce the number of imports."
            )

    get_project_or_404(db, project_id, current_user)
    effective_api_key = (api_key or "").strip() or get_setting(db, "openai_api_key")
    ai_custom_columns = [
        {
            "name": col.name,
            "description": col.ai_description or "",
        }
        for col in db.query(CustomColumn)
        .filter(CustomColumn.project_id == project_id, CustomColumn.ai_enabled == True)  # noqa: E712
        .order_by(CustomColumn.id.asc())
        .all()
    ]
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
            result = process_luminaire_document(
                str(saved_path),
                api_key=effective_api_key,
                custom_columns=ai_custom_columns,
            )
            created_rows.append(("upload", upload.filename or "document.pdf", None, stored_document, result))
        except Exception as exc:
            failures.append({"source": upload.filename or "upload", "error": str(exc)})
            if saved_path and saved_path.exists():
                saved_path.unlink(missing_ok=True)

    for url in submitted_urls:
        saved_path = None
        try:
            saved_path, stored_document = download_pdf(url)
            result = process_luminaire_document(
                str(saved_path),
                api_key=effective_api_key,
                custom_columns=ai_custom_columns,
            )
            created_rows.append(("url", Path(url).name or url, url, stored_document, result))
        except Exception as exc:
            failures.append({"source": url, "error": str(exc)})
            if saved_path and saved_path.exists():
                saved_path.unlink(missing_ok=True)

    persisted = []
    with session_scope() as db2:
        for source_type, source_name, source_url, stored_document, result in created_rows:
            product_path = save_extracted_asset(result.get("product_image_path"), PRODUCT_IMAGES_DIR, "products")
            diagram_path = save_extracted_asset(result.get("diagram_image_path"), DIAGRAM_IMAGES_DIR, "diagrams")
            polar_path = save_extracted_asset(result.get("polar_image_path"), POLAR_IMAGES_DIR, "polar")
            metadata = result.get("metadata", {})
            custom_field_values = {}
            for column in ai_custom_columns:
                value = result.get("custom_fields", {}).get(column["name"], "")
                if value is None:
                    continue
                text_value = str(value).strip()
                if text_value:
                    custom_field_values[column["name"]] = text_value
            row = Luminaire(
                project_id=project_id,
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
                polar_image_path=polar_path,
                custom_data=json.dumps(custom_field_values),
            )
            db2.add(row)
            db2.flush()
            persisted.append(serialize_luminaire(row))

        # ── Deduct tokens: 1 per successfully imported PDF (admin exempt) ──
        if current_user.role != "admin" and len(persisted) > 0:
            user_obj = db2.query(User).filter(User.id == current_user.id).first()
            if user_obj:
                user_obj.tokens = max(0, user_obj.tokens - len(persisted))

        db2.commit()

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
@app.get("/api/settings/public")
def api_get_public_settings():
    """Returns non-sensitive settings needed by all pages (e.g. brand name)."""
    with session_scope() as db:
        return {
            "companyName": get_setting(db, "company_name", "LumenFlow"),
        }

@app.get("/api/settings")
def api_get_settings(current_user: User = Depends(get_admin_user)):
    with session_scope() as db:
        row = (
            db.query(AppSetting)
            .filter(AppSetting.key == "openai_api_key", AppSetting.project_id == None)  # noqa: E711
            .order_by(AppSetting.updated_at.desc())
            .first()
        )
        return {
            "companyName": get_setting(db, "company_name", "LumenFlow"),
            "items": [{
                "key": "openai_api_key",
                "label": "OpenAI API Key",
                "value": "Configured" if row and row.value else "Not set",
                "status": "Active" if row and row.value else "Missing",
                "updatedAt": row.updated_at.isoformat() if row and row.updated_at else "",
            }]
        }

@app.post("/api/settings")
async def api_save_settings(request: Request, current_user: User = Depends(get_admin_user)):
    data = await request.json()
    with session_scope() as db:
        key = data.get("openaiApiKey", "").strip()
        if key:
            set_setting(db, "openai_api_key", key)
        company_name = data.get("companyName", "").strip()
        if company_name:
            set_setting(db, "company_name", company_name)
        db.commit()
    return {"ok": True}


@app.get("/api/templates")
def api_list_templates(project_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        rows = db.query(DesignTemplate).filter(DesignTemplate.project_id == project_id).order_by(DesignTemplate.updated_at.desc()).all()
        return {"templates": [serialize_template(r) for r in rows]}

@app.get("/api/templates/{template_id}")
def api_get_template(template_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        template = db.query(DesignTemplate).filter(DesignTemplate.id == template_id).first()
        if not template: raise HTTPException(404, "Template not found")
        get_project_or_404(db, template.project_id, current_user)
        if not template: raise HTTPException(404, "Template not found")
        return {"template": serialize_template(template)}

@app.post("/api/templates")
async def api_create_template(request: Request, project_id: int, current_user: User = Depends(get_current_user)):
    payload = await request.json()
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        first_lum = db.query(Luminaire).filter(Luminaire.project_id == project_id).first()
        template = DesignTemplate(
            project_id=project_id,
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
async def api_update_template(template_id: int, project_id: int, request: Request, current_user: User = Depends(get_current_user)):
    payload = await request.json()
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        template = db.query(DesignTemplate).filter(DesignTemplate.id == template_id, DesignTemplate.project_id == project_id).first()
        if not template: raise HTTPException(404, "Template not found")
        template.name = payload.get("name") or template.name
        if "designJson" in payload:
            template.design_json = payload.get("designJson")
        template.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(template)
        return {"template": serialize_template(template)}

@app.delete("/api/templates/{template_id}")
def api_delete_template(template_id: int, project_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        template = db.query(DesignTemplate).filter(DesignTemplate.id == template_id, DesignTemplate.project_id == project_id).first()
        if not template: raise HTTPException(404, "Template not found")
        db.delete(template)
        db.commit()
        return {"ok": True}

@app.post("/api/luminaires/{luminaire_id}/templates/{template_id}/export")
def api_export_template(luminaire_id: int, template_id: int, project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_project_or_404(db, project_id, current_user)

    row = db.query(Luminaire).filter(Luminaire.id == luminaire_id, Luminaire.project_id == project_id).first()
    template = db.query(DesignTemplate).filter(DesignTemplate.id == template_id, DesignTemplate.project_id == project_id).first()
    if not row or not template:
        raise HTTPException(404, "Luminaire or Template not found")
    
    rel = create_pdf_export(db, row, template)
    gen = GeneratedDocument(luminaire_id=luminaire_id, template_id=template_id, title=f"{template.name}.pdf", file_path=rel)
    db.add(gen)
    db.commit()
    db.refresh(gen)
    return {"document": serialize_generated_document(gen)}


def render_page_for_luminaire(pdf: canvas.Canvas, db: Session, row: Luminaire, template: DesignTemplate, ph: float):
    """Render one full page worth of items for a single luminaire row onto the canvas."""
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


@app.post("/api/bulk-export")
async def api_bulk_export(project_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Generate a single multi-page PDF — one page per luminaire — using a shared template."""
    body = await request.json()
    luminaire_ids: list[int] = body.get("luminaire_ids", [])
    template_id: int = body.get("template_id", 0)

    if not luminaire_ids or not template_id:
        raise HTTPException(400, "luminaire_ids and template_id are required")

    get_project_or_404(db, project_id, current_user)
    
    template = db.query(DesignTemplate).filter(
        DesignTemplate.id == template_id,
        DesignTemplate.project_id == project_id
    ).first()
    if not template:
        raise HTTPException(404, "Template not found")

    pw, ph = page_dimensions(template.page_size, template.page_width, template.page_height)
    name = f"bulk_{uuid.uuid4().hex}.pdf"
    rel = f"exports/{name}"
    pdf = canvas.Canvas(str(EXPORTS_DIR / name), pagesize=(pw, ph))

    rendered = 0
    first_luminaire_id = luminaire_ids[0] if luminaire_ids else None

    for lid in luminaire_ids:
        row = db.query(Luminaire).filter(
            Luminaire.id == lid,
            Luminaire.project_id == project_id
        ).first()
        if not row:
            continue
        render_page_for_luminaire(pdf, db, row, template, ph)
        pdf.showPage()
        rendered += 1

    if rendered == 0:
        raise HTTPException(404, "No matching luminaires found")

    pdf.save()

    # Store a single GeneratedDocument entry for the bundle (linked to first luminaire)
    gen = GeneratedDocument(
        luminaire_id=first_luminaire_id,
        template_id=template_id,
        title=f"{template.name} ({rendered} pages).pdf",
        file_path=rel,
    )
    db.add(gen)
    
    db.commit()
    db.refresh(gen)
    return {"document": serialize_generated_document(gen), "pages": rendered}



@app.get("/api/exports")
def api_list_exports(project_id: int, current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        get_project_or_404(db, project_id, current_user)
        rows = db.query(GeneratedDocument).join(Luminaire).filter(Luminaire.project_id == project_id).order_by(GeneratedDocument.created_at.desc()).all()
        return {"items": [serialize_generated_document(r) for r in rows]}

@app.post("/api/luminaires/{luminaire_id}/designer-assets")
async def api_upload_asset(luminaire_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    with session_scope() as db:
        row = db.query(Luminaire).filter(Luminaire.id == luminaire_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        get_project_or_404(db, row.project_id, current_user)
    name = f"{luminaire_id}_{uuid.uuid4().hex}{Path(file.filename or '.png').suffix}"
    target = DESIGNER_IMAGES_DIR / name
    with target.open("wb") as b: shutil.copyfileobj(file.file, b)
    return {"imageUrl": to_public_file_url(f"images/designer/{name}"), "fileName": file.filename}

if __name__ == "__main__":
    reload_enabled = os.getenv("UVICORN_RELOAD", "").lower() in {"1", "true", "yes"}
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=reload_enabled)
