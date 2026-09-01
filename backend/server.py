from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import json
import logging
import os
import re
import secrets
import uuid

import bcrypt
import httpx
import jwt
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

from security_features import (
    PASSWORD_POLICY,
    audit,
    send_password_reset_email,
    send_verification_email,
    token_hash,
    validate_password,
    verify_domain_txt,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.getenv("JWT_SECRET", "vaga-ai-local-secret-32-characters")
EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")
JWT_TTL_DAYS = 7

app = FastAPI(title="Vagas+ API")
api_router = APIRouter(prefix="/api")
room_connections: Dict[str, Dict[str, WebSocket]] = {}
DEFAULT_PIPELINE_STAGES = [
    "Pré-triagem",
    "Análise de currículo",
    "Entrevista",
    "Videochamada",
    "Avaliação",
    "Decisão final",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_words(value: str) -> set[str]:
    return set(re.findall(r"[a-zA-ZÀ-ÿ0-9]{3,}", value.lower()))


# ------------------------------- Schemas -------------------------------


class AuthInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = Field(pattern="^(candidate|recruiter)$")


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SessionInput(BaseModel):
    session_id: str = Field(min_length=8, max_length=512)


class PasswordChangeInput(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str = Field(min_length=16, max_length=200)
    new_password: str


class RecruiterVerificationInput(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    corporate_email: EmailStr
    corporate_domain: str = Field(min_length=4, max_length=120)
    phone: str = Field(default="", max_length=30)


class DomainVerificationInput(BaseModel):
    domain: str


class StageInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    order: int = Field(ge=0, le=20)


class ApplicationStageInput(BaseModel):
    stage: str = Field(min_length=2, max_length=80)
    score: Optional[int] = Field(default=None, ge=0, le=100)
    notes: str = Field(default="", max_length=2000)


class RoomCreateInput(BaseModel):
    job_id: str
    application_id: str = ""
    retention_minutes: int = Field(default=60, ge=5, le=1440)
    max_participants: int = Field(default=4, ge=2, le=8)


class RoomJoinInput(BaseModel):
    code: str = Field(min_length=8, max_length=128)


class ConsentInput(BaseModel):
    privacy_version: str = Field(min_length=1, max_length=30)
    profile_visibility: str = Field(pattern="^(public|matched_only|private)$")


class ProfileInput(BaseModel):
    name: str = ""
    headline: str = ""
    summary: str = ""
    phone: str = ""
    location: str = ""
    experiences: List[Dict[str, Any]] = Field(default_factory=list)
    education: List[Dict[str, Any]] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)
    portfolio: List[Dict[str, Any]] = Field(default_factory=list)
    preferences: Dict[str, Any] = Field(default_factory=dict)


class JobInput(BaseModel):
    title: str = Field(min_length=2)
    company: str = Field(min_length=2)
    location: str = "Remoto"
    modality: str = "Remoto"
    description: str = Field(min_length=10)
    essential_requirements: List[str] = Field(min_length=1)
    differentiators: List[str] = Field(default_factory=list)
    pipeline_stages: List[str] = Field(default_factory=list)
    retention_minutes: int = Field(default=60, ge=5, le=1440)


class ApplyInput(BaseModel):
    resume_text: str = ""
    resume_title: str = "Currículo personalizado"


class ResumeInput(BaseModel):
    job_id: str


class MessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


# --------------------------- Helpers ---------------------------


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": user["id"], "email": user["email"], "role": user["role"], "profile": user.get("profile", {})}


def make_token(user: Dict[str, Any]) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user["id"], "role": user["role"], "iat": now, "exp": now + timedelta(days=JWT_TTL_DAYS)},
        JWT_SECRET,
        algorithm="HS256",
    )


def bearer_value(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip()


async def current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    token = bearer_value(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Faça login para continuar")
    user: Optional[Dict[str, Any]] = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    except Exception:
        user = None
    if not user:
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        expires_at = session.get("expires_at") if session else None
        if expires_at and isinstance(expires_at, datetime) and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if session and expires_at and expires_at > datetime.now(timezone.utc):
            user = await db.users.find_one({"id": session.get("user_id")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    return user


async def require_role(user: Dict[str, Any], role: str) -> None:
    if user.get("role") != role:
        raise HTTPException(status_code=403, detail="Ação não disponível para este perfil")


async def push_notification(user_id: str, kind: str, title: str, body: str, meta: Optional[Dict[str, Any]] = None) -> None:
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "kind": kind,
        "title": title,
        "body": body,
        "meta": meta or {},
        "read": False,
        "created_at": now_iso(),
    })


def candidate_corpus(profile: Dict[str, Any]) -> str:
    parts = [profile.get("summary", ""), profile.get("headline", ""), profile.get("location", "")]
    parts.extend(profile.get("skills", []))
    parts.extend(profile.get("languages", []))
    for item in profile.get("experiences", []) + profile.get("education", []) + profile.get("portfolio", []):
        parts.extend(str(value) for value in item.values())
    return " ".join(parts)


def requirement_match(profile: Dict[str, Any], job: Dict[str, Any]) -> Dict[str, Any]:
    corpus = candidate_corpus(profile)
    corpus_words = clean_words(corpus)

    def evaluate(items: List[str]) -> tuple[List[str], List[str]]:
        matched, missing = [], []
        for item in items:
            words = clean_words(item)
            overlap = words.intersection(corpus_words)
            if words and (len(overlap) >= max(1, round(len(words) * 0.25)) or item.lower() in corpus.lower()):
                matched.append(item)
            else:
                missing.append(item)
        return matched, missing

    essential_met, essential_missing = evaluate(job.get("essential_requirements", []))
    differentiators_met, differentiators_missing = evaluate(job.get("differentiators", []))
    essential_total = len(job.get("essential_requirements", [])) or 1
    differentiator_total = len(job.get("differentiators", [])) or 1
    essential_score = round(len(essential_met) / essential_total * 100)
    differentiator_score = round(len(differentiators_met) / differentiator_total * 100) if job.get("differentiators") else 0
    score = round(essential_score * 0.7 + differentiator_score * 0.3) if job.get("differentiators") else essential_score
    advantages = [f"Apresenta o diferencial: {item}." for item in differentiators_met]
    disadvantages = [f"Faltam {len(essential_missing)} requisito(s) imprescindível(is)."] if essential_missing else []
    if differentiators_missing and job.get("differentiators"):
        disadvantages.append(f"Não foi identificado atendimento a {len(differentiators_missing)} diferencial(is).")
    return {
        "score": score,
        "essential_score": essential_score,
        "differentiator_score": differentiator_score,
        "essential_met": essential_met,
        "essential_missing": essential_missing,
        "differentiators_met": differentiators_met,
        "differentiators_missing": differentiators_missing,
        "advantages": advantages,
        "disadvantages": disadvantages,
        "fit_summary": (
            f"Compatibilidade de {score}%, com {len(essential_met)} de {len(job.get('essential_requirements', []))}"
            " requisitos imprescindíveis atendidos."
        ),
    }


# ------------------------------- Routes -------------------------------


@api_router.get("/")
async def root() -> Dict[str, str]:
    return {"message": "Vagas+ API online"}


@api_router.post("/auth/register")
async def register(data: AuthInput) -> Dict[str, Any]:
    validate_password(data.password)
    email = data.email.lower()
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Este e-mail já está cadastrado")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode(),
        "role": data.role,
        "profile": {"name": ""} if data.role == "candidate" else {},
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    await audit(db, user["id"], "auth.register", {"role": user["role"]})
    return {"token": make_token(user), "user": public_user(user)}


@api_router.post("/auth/login")
async def login(data: LoginInput) -> Dict[str, Any]:
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not bcrypt.checkpw(data.password.encode(), user["password_hash"].encode()):
        await audit(db, None, "auth.login_failed", {"email": data.email.lower()})
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    await audit(db, user["id"], "auth.login", {})
    return {"token": make_token(user), "user": public_user(user)}


@api_router.post("/auth/change-password")
async def change_password(data: PasswordChangeInput, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, str]:
    if not user.get("password_hash") or not bcrypt.checkpw(data.current_password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Senha atual incorreta")
    validate_password(data.new_password)
    password_hash = bcrypt.hashpw(data.new_password.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": password_hash, "password_updated_at": now_iso()}})
    await audit(db, user["id"], "auth.password_changed", {})
    return {"message": "Senha atualizada com sucesso"}


@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordInput) -> Dict[str, str]:
    email = data.email.lower()
    generic = {"message": "Se este e-mail existir na Vagas+, enviaremos as instruções em instantes."}
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        # Não revelamos existência do usuário; usuários Google só devem entrar pelo Google.
        await audit(db, None, "auth.forgot_password_unknown", {"email": email})
        return generic
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    await db.password_resets.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "email": email,
        "token_hash": token_hash(token),
        "created_at": datetime.now(timezone.utc),
        "expires_at": expires_at,
        "used_at": None,
    })
    try:
        await send_password_reset_email(email, token)
    except HTTPException:
        # Se o envio falhar, ainda respondemos genericamente por privacidade.
        await audit(db, user["id"], "auth.forgot_password_send_failed", {})
        return generic
    await audit(db, user["id"], "auth.forgot_password_sent", {})
    return generic


@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordInput) -> Dict[str, str]:
    validate_password(data.new_password)
    record = await db.password_resets.find_one({"token_hash": token_hash(data.token)}, {"_id": 0})
    if not record or record.get("used_at"):
        raise HTTPException(status_code=400, detail="Link inválido ou já utilizado")
    expires_at = record["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Link expirado, solicite novamente")
    password_hash = bcrypt.hashpw(data.new_password.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one(
        {"id": record["user_id"]},
        {"$set": {"password_hash": password_hash, "password_updated_at": now_iso()}},
    )
    await db.password_resets.update_one(
        {"id": record["id"]}, {"$set": {"used_at": datetime.now(timezone.utc)}}
    )
    # Invalida sessões existentes por segurança.
    await db.user_sessions.delete_many({"user_id": record["user_id"]})
    await audit(db, record["user_id"], "auth.password_reset_completed", {})
    return {"message": "Senha atualizada. Faça login com a nova senha."}


@api_router.post("/auth/session")
async def exchange_google_session(data: SessionInput) -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            response = await http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": data.session_id},
            )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Sessão Google inválida ou expirada")
        external = response.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Não foi possível validar o login Google") from exc
    email = str(external.get("email", "")).lower()
    if not email:
        raise HTTPException(status_code=401, detail="Login Google sem e-mail verificável")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = {
            "id": f"user_{uuid.uuid4().hex[:12]}",
            "email": email,
            "role": "candidate",
            "profile": {"name": external.get("name", "")},
            "created_at": now_iso(),
            "auth_provider": "google",
        }
        await db.users.insert_one(user)
    session_token = external.get("session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Sessão Google incompleta")
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "session_token": session_token,
                "user_id": user["id"],
                "created_at": datetime.now(timezone.utc),
                "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            }
        },
        upsert=True,
    )
    await audit(db, user["id"], "auth.google_login", {})
    return {"session_token": session_token, "user": public_user(user)}


@api_router.get("/me")
async def me(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    return public_user(user)


@api_router.put("/me/profile")
async def update_profile(data: ProfileInput, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "candidate")
    profile = data.model_dump()
    await db.users.update_one({"id": user["id"]}, {"$set": {"profile": profile}})
    user["profile"] = profile
    return public_user(user)


@api_router.get("/jobs")
async def list_jobs(q: str = Query(default=""), user: Dict[str, Any] = Depends(current_user)) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"status": "published"}
    if q.strip():
        query["$or"] = [
            {"title": {"$regex": q.strip(), "$options": "i"}},
            {"company": {"$regex": q.strip(), "$options": "i"}},
        ]
    jobs = await db.jobs.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    if user.get("role") == "candidate":
        for job in jobs:
            job["match"] = requirement_match(user.get("profile", {}), job)
    return jobs


@api_router.post("/jobs")
async def create_job(data: JobInput, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    job_data = data.model_dump()
    stages = job_data.pop("pipeline_stages") or DEFAULT_PIPELINE_STAGES
    job = {
        "id": str(uuid.uuid4()),
        "recruiter_id": user["id"],
        "status": "published",
        "created_at": now_iso(),
        "pipeline_stages": stages,
        **job_data,
    }
    await db.jobs.insert_one(job)
    await audit(db, user["id"], "job.created", {"job_id": job["id"]})
    return {key: value for key, value in job.items() if key != "_id"}


@api_router.get("/recruiter/jobs")
async def recruiter_jobs(user: Dict[str, Any] = Depends(current_user)) -> List[Dict[str, Any]]:
    await require_role(user, "recruiter")
    return await db.jobs.find({"recruiter_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.get("/jobs/{job_id}")
async def get_job(job_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    if user.get("role") == "candidate":
        job["match"] = requirement_match(user.get("profile", {}), job)
    return job


@api_router.post("/jobs/{job_id}/apply")
async def apply_to_job(job_id: str, data: ApplyInput, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "candidate")
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    match = requirement_match(user.get("profile", {}), job)
    existing = await db.applications.find_one({"job_id": job_id, "candidate_id": user["id"]}, {"_id": 0})
    application_id = existing["id"] if existing else str(uuid.uuid4())
    application = {
        "id": application_id,
        "job_id": job_id,
        "candidate_id": user["id"],
        "candidate_email": user["email"],
        "candidate_name": user.get("profile", {}).get("name") or user["email"].split("@")[0],
        "profile": user.get("profile", {}),
        "resume_text": data.resume_text,
        "resume_title": data.resume_title,
        "stage": existing.get("stage") if existing else "Pré-triagem",
        "created_at": existing.get("created_at") if existing else now_iso(),
        "updated_at": now_iso(),
        **match,
    }
    await db.applications.update_one(
        {"job_id": job_id, "candidate_id": user["id"]},
        {"$set": application},
        upsert=True,
    )
    if not existing:
        await push_notification(
            job["recruiter_id"],
            "application",
            "Nova candidatura",
            f"{application['candidate_name']} se candidatou para {job['title']}.",
            {"job_id": job_id, "application_id": application_id},
        )
    return {
        "message": "Candidatura enviada",
        "application": {key: value for key, value in application.items() if key != "profile"},
    }


@api_router.get("/jobs/{job_id}/applications")
async def job_applications(job_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    job = await db.jobs.find_one({"id": job_id, "recruiter_id": user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    applications = await db.applications.find({"job_id": job_id}, {"_id": 0}).sort("score", -1).to_list(100)
    differentiator_total = len(job.get("differentiators", []))
    return {
        "job": job,
        "total": len(applications),
        "essential_fully_met": sum(1 for item in applications if item.get("essential_score") == 100),
        "differentiator_fully_met": sum(
            1 for item in applications if differentiator_total and item.get("differentiator_score") == 100
        ),
        "essential_total": len(job.get("essential_requirements", [])),
        "differentiator_total": differentiator_total,
        "applications": applications,
    }


@api_router.get("/candidate/applications")
async def candidate_applications(user: Dict[str, Any] = Depends(current_user)) -> List[Dict[str, Any]]:
    await require_role(user, "candidate")
    applications = await db.applications.find({"candidate_id": user["id"]}, {"_id": 0, "profile": 0}).sort("updated_at", -1).to_list(100)
    for item in applications:
        job = await db.jobs.find_one({"id": item["job_id"]}, {"_id": 0, "title": 1, "company": 1})
        item["job_title"] = job.get("title", "") if job else ""
        item["job_company"] = job.get("company", "") if job else ""
    return applications


# --------------------------- Recruiter verification ---------------------------


@api_router.post("/recruiter/verification/start")
async def start_recruiter_verification(
    data: RecruiterVerificationInput, user: Dict[str, Any] = Depends(current_user)
) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    domain = data.corporate_domain.lower().strip().lstrip("@").rstrip(".")
    email_domain = str(data.corporate_email).lower().split("@")[-1]
    if email_domain != domain:
        raise HTTPException(status_code=422, detail="O e-mail precisa usar o domínio corporativo informado")
    if domain in {"gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"}:
        raise HTTPException(status_code=422, detail="Use um domínio corporativo, não um domínio público")
    email_token = secrets.token_urlsafe(32)
    domain_token = secrets.token_urlsafe(24)
    verification = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "company_name": data.company_name,
        "corporate_email": str(data.corporate_email),
        "domain": domain,
        "phone": data.phone,
        "email_token_hash": token_hash(email_token),
        "domain_token": domain_token,
        "email_status": "pending",
        "domain_status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.recruiter_verifications.update_one({"user_id": user["id"]}, {"$set": verification}, upsert=True)
    try:
        await send_verification_email(str(data.corporate_email), email_token)
        email_sent = True
    except HTTPException:
        email_sent = False
    await audit(db, user["id"], "recruiter.verification_started", {"domain": domain, "email_sent": email_sent})
    return {
        "email_status": "pending",
        "domain_status": "pending",
        "email_sent": email_sent,
        "dns_record": {"type": "TXT", "name": f"_vagasplus-verification.{domain}", "value": domain_token},
    }


@api_router.get("/recruiter/verification")
async def recruiter_verification(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    verification = await db.recruiter_verifications.find_one(
        {"user_id": user["id"]}, {"_id": 0, "email_token_hash": 0, "domain_token": 0}
    )
    return verification or {"email_status": "not_started", "domain_status": "not_started"}


@api_router.post("/recruiter/verification/email/{token}")
async def verify_recruiter_email(token: str) -> Dict[str, str]:
    verification = await db.recruiter_verifications.find_one({"email_token_hash": token_hash(token)}, {"_id": 0})
    if not verification:
        raise HTTPException(status_code=400, detail="Token de e-mail inválido ou expirado")
    await db.recruiter_verifications.update_one(
        {"id": verification["id"]},
        {"$set": {"email_status": "verified", "updated_at": now_iso()}, "$unset": {"email_token_hash": ""}},
    )
    await audit(db, verification["user_id"], "recruiter.email_verified", {})
    return {"message": "E-mail corporativo verificado"}


@api_router.post("/recruiter/verification/domain")
async def verify_recruiter_domain(
    data: DomainVerificationInput, user: Dict[str, Any] = Depends(current_user)
) -> Dict[str, str]:
    await require_role(user, "recruiter")
    verification = await db.recruiter_verifications.find_one(
        {"user_id": user["id"], "domain": data.domain.lower().strip()}, {"_id": 0}
    )
    if not verification:
        raise HTTPException(status_code=404, detail="Inicie a verificação do domínio primeiro")
    valid = await verify_domain_txt(verification["domain"], verification["domain_token"])
    if not valid:
        raise HTTPException(status_code=422, detail="Registro TXT ainda não foi encontrado")
    await db.recruiter_verifications.update_one(
        {"id": verification["id"]},
        {"$set": {"domain_status": "verified", "updated_at": now_iso()}, "$unset": {"domain_token": ""}},
    )
    await audit(db, user["id"], "recruiter.domain_verified", {"domain": verification["domain"]})
    return {"message": "Domínio corporativo verificado"}


# --------------------------- Pipeline ---------------------------


@api_router.get("/jobs/{job_id}/pipeline")
async def get_pipeline(job_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    job = await db.jobs.find_one({"id": job_id, "recruiter_id": user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    applications = await db.applications.find({"job_id": job_id}, {"_id": 0}).sort("score", -1).to_list(100)
    stages = job.get("pipeline_stages") or DEFAULT_PIPELINE_STAGES
    counts = {stage: sum(1 for item in applications if item.get("stage", stages[0]) == stage) for stage in stages}
    return {"job": job, "stages": stages, "applications": applications, "counts": counts}


@api_router.post("/jobs/{job_id}/stages")
async def add_pipeline_stage(
    job_id: str, data: StageInput, user: Dict[str, Any] = Depends(current_user)
) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    job = await db.jobs.find_one({"id": job_id, "recruiter_id": user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    stages = list(job.get("pipeline_stages") or DEFAULT_PIPELINE_STAGES)
    if data.name not in stages:
        insert_at = max(0, min(data.order, len(stages)))
        stages.insert(insert_at, data.name)
        await db.jobs.update_one({"id": job_id}, {"$set": {"pipeline_stages": stages}})
    return {"stages": stages}


@api_router.patch("/jobs/{job_id}/applications/{application_id}/stage")
async def update_application_stage(
    job_id: str,
    application_id: str,
    data: ApplicationStageInput,
    user: Dict[str, Any] = Depends(current_user),
) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    job = await db.jobs.find_one({"id": job_id, "recruiter_id": user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    application = await db.applications.find_one({"id": application_id, "job_id": job_id}, {"_id": 0})
    if not application:
        raise HTTPException(status_code=404, detail="Candidatura não encontrada")
    scores = application.get("stage_scores", {})
    if data.score is not None:
        scores[data.stage] = data.score
    update = {"stage": data.stage, "stage_scores": scores, "stage_notes": data.notes, "updated_at": now_iso()}
    if "triagem" in data.stage.lower():
        update["pre_screen_score"] = data.score
    if "vídeo" in data.stage.lower() or "video" in data.stage.lower():
        update["video_score"] = data.score
    await db.applications.update_one({"id": application_id}, {"$set": update})
    await push_notification(
        application["candidate_id"],
        "stage",
        "Sua candidatura avançou",
        f"Etapa atual: {data.stage} — {job['title']}",
        {"job_id": job_id, "application_id": application_id, "stage": data.stage},
    )
    await audit(db, user["id"], "application.stage_updated", {"application_id": application_id, "stage": data.stage})
    return {"id": application_id, **update}


# --------------------------- Video rooms ---------------------------


@api_router.post("/video/rooms")
async def create_video_room(data: RoomCreateInput, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    job = await db.jobs.find_one({"id": data.job_id, "recruiter_id": user["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    application: Optional[Dict[str, Any]] = None
    if data.application_id:
        application = await db.applications.find_one({"id": data.application_id, "job_id": data.job_id}, {"_id": 0})
        if not application:
            raise HTTPException(status_code=404, detail="Candidatura não encontrada")
    room_id = str(uuid.uuid4())
    code = secrets.token_urlsafe(9)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=data.retention_minutes)
    room = {
        "id": room_id,
        "job_id": data.job_id,
        "application_id": data.application_id,
        "owner_id": user["id"],
        "code_hash": token_hash(code),
        "created_at": now,
        "expires_at": expires_at,
        "retention_minutes": data.retention_minutes,
        "max_participants": data.max_participants,
        "recording": False,
        "status": "open",
        "authorized_ids": [user["id"]] + ([application["candidate_id"]] if application else []),
    }
    await db.video_rooms.insert_one(room)
    if application:
        await push_notification(
            application["candidate_id"],
            "video",
            "Videochamada agendada",
            f"Vaga: {job['title']} — use o código para entrar.",
            {
                "room_id": room_id,
                "code": code,
                "expires_at": expires_at.isoformat(),
                "job_id": data.job_id,
            },
        )
    await audit(db, user["id"], "video.room_created", {"room_id": room_id, "retention_minutes": data.retention_minutes})
    return {"room_id": room_id, "code": code, "expires_at": expires_at.isoformat(), "recording": False}


@api_router.post("/video/rooms/{room_id}/join")
async def join_video_room(
    room_id: str, data: RoomJoinInput, user: Dict[str, Any] = Depends(current_user)
) -> Dict[str, Any]:
    room = await db.video_rooms.find_one({"id": room_id}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    expires_at = room["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc) or room.get("status") != "open":
        raise HTTPException(status_code=410, detail="Sala expirada")
    if not secrets.compare_digest(room["code_hash"], token_hash(data.code)):
        await audit(db, user["id"], "video.join_failed", {"room_id": room_id})
        raise HTTPException(status_code=401, detail="Código de sala inválido")
    authorized = room.get("authorized_ids")
    if authorized and user["id"] not in authorized:
        raise HTTPException(status_code=403, detail="Você não faz parte desta sala")
    participant_id = str(uuid.uuid4())
    participant_token = jwt.encode(
        {
            "sub": user["id"],
            "participant": participant_id,
            "room": room_id,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    await db.video_rooms.update_one({"id": room_id}, {"$addToSet": {"participants": user["id"]}})
    await audit(db, user["id"], "video.room_joined", {"room_id": room_id})
    return {
        "participant_token": participant_token,
        "participant_id": participant_id,
        "room_id": room_id,
        "expires_at": expires_at.isoformat(),
    }


@api_router.post("/video/rooms/{room_id}/close")
async def close_video_room(room_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, str]:
    room = await db.video_rooms.find_one({"id": room_id, "owner_id": user["id"]}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    await db.video_rooms.update_one(
        {"id": room_id}, {"$set": {"status": "closed", "closed_at": datetime.now(timezone.utc)}}
    )
    await audit(db, user["id"], "video.room_closed", {"room_id": room_id})
    return {"message": "Sala encerrada"}


@api_router.websocket("/video/ws/{room_id}")
async def video_signaling(websocket: WebSocket, room_id: str, token: str) -> None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("room") != room_id:
            raise ValueError("room mismatch")
        participant = payload["participant"]
        room = await db.video_rooms.find_one({"id": room_id}, {"_id": 0})
        expires_at = room.get("expires_at") if room else None
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if (
            not room
            or (expires_at and expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc))
            or room.get("status") != "open"
        ):
            raise ValueError("expired room")
    except Exception:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    peers = room_connections.setdefault(room_id, {})
    if len(peers) >= int(room.get("max_participants", 4)):
        await websocket.close(code=1008)
        return
    peers[participant] = websocket
    try:
        await websocket.send_json({"type": "peers", "peers": [key for key in peers if key != participant]})
        while True:
            message = await websocket.receive_json()
            if message.get("type") not in {"offer", "answer", "ice"}:
                continue
            target = message.get("to")
            if not isinstance(target, str) or target not in peers:
                continue
            await peers[target].send_json({**message, "from": participant})
    except WebSocketDisconnect:
        peers.pop(participant, None)
        if not peers:
            room_connections.pop(room_id, None)


# --------------------------- Chat ---------------------------


async def _application_participants(application_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    application = await db.applications.find_one({"id": application_id}, {"_id": 0})
    if not application:
        raise HTTPException(status_code=404, detail="Candidatura não encontrada")
    job = await db.jobs.find_one({"id": application["job_id"]}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    if user["id"] not in {application["candidate_id"], job["recruiter_id"]}:
        raise HTTPException(status_code=403, detail="Você não participa desta conversa")
    return {"application": application, "job": job}


@api_router.get("/applications/{application_id}/messages")
async def list_messages(application_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    context = await _application_participants(application_id, user)
    messages = await db.messages.find({"application_id": application_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {
        "application": {
            "id": context["application"]["id"],
            "candidate_id": context["application"]["candidate_id"],
            "candidate_name": context["application"].get("candidate_name", ""),
            "stage": context["application"].get("stage", ""),
        },
        "job": {"id": context["job"]["id"], "title": context["job"]["title"], "company": context["job"]["company"]},
        "messages": messages,
    }


@api_router.post("/applications/{application_id}/messages")
async def send_message(
    application_id: str, data: MessageInput, user: Dict[str, Any] = Depends(current_user)
) -> Dict[str, Any]:
    context = await _application_participants(application_id, user)
    message = {
        "id": str(uuid.uuid4()),
        "application_id": application_id,
        "job_id": context["job"]["id"],
        "sender_id": user["id"],
        "sender_role": user["role"],
        "body": data.body.strip(),
        "created_at": now_iso(),
    }
    await db.messages.insert_one(message)
    recipient_id = (
        context["job"]["recruiter_id"]
        if user["id"] == context["application"]["candidate_id"]
        else context["application"]["candidate_id"]
    )
    await push_notification(
        recipient_id,
        "message",
        "Nova mensagem",
        f"{context['job']['title']}: {data.body[:60]}",
        {"application_id": application_id, "job_id": context["job"]["id"]},
    )
    return {key: value for key, value in message.items() if key != "_id"}


# --------------------------- Notifications ---------------------------


@api_router.get("/notifications")
async def list_notifications(user: Dict[str, Any] = Depends(current_user)) -> List[Dict[str, Any]]:
    return await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.post("/notifications/read")
async def mark_all_read(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, int]:
    result = await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"updated": result.modified_count}


@api_router.post("/notifications/{notification_id}/read")
async def mark_read(notification_id: str, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, str]:
    await db.notifications.update_one({"id": notification_id, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"message": "Notificação atualizada"}


# --------------------------- Dashboard ---------------------------


@api_router.get("/recruiter/dashboard")
async def recruiter_dashboard(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    jobs = await db.jobs.find({"recruiter_id": user["id"]}, {"_id": 0}).to_list(200)
    job_ids = [job["id"] for job in jobs]
    applications = (
        await db.applications.find({"job_id": {"$in": job_ids}}, {"_id": 0}).to_list(1000) if job_ids else []
    )
    stage_totals: Dict[str, int] = {}
    for item in applications:
        stage = item.get("stage") or "Pré-triagem"
        stage_totals[stage] = stage_totals.get(stage, 0) + 1
    job_breakdown = []
    for job in jobs:
        job_apps = [item for item in applications if item.get("job_id") == job["id"]]
        avg_score = round(sum(item.get("score", 0) for item in job_apps) / len(job_apps)) if job_apps else 0
        job_breakdown.append(
            {
                "job_id": job["id"],
                "title": job["title"],
                "company": job["company"],
                "total": len(job_apps),
                "avg_score": avg_score,
                "in_final_stage": sum(1 for item in job_apps if item.get("stage") == "Decisão final"),
            }
        )
    total = len(applications)
    reached_final = sum(1 for item in applications if item.get("stage") == "Decisão final")
    return {
        "totals": {
            "jobs": len(jobs),
            "applications": total,
            "reached_final": reached_final,
            "conversion_rate": round((reached_final / total) * 100) if total else 0,
        },
        "stage_totals": stage_totals,
        "jobs": job_breakdown,
    }


# --------------------------- Privacy / LGPD ---------------------------


@api_router.post("/me/consent")
async def save_consent(data: ConsentInput, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    consent = {
        "privacy_version": data.privacy_version,
        "profile_visibility": data.profile_visibility,
        "accepted_at": now_iso(),
    }
    await db.users.update_one({"id": user["id"]}, {"$set": {"consent": consent}})
    await audit(db, user["id"], "privacy.consent_updated", consent)
    return consent


@api_router.get("/me/security")
async def security_status(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    verification = None
    if user.get("role") == "recruiter":
        verification = await db.recruiter_verifications.find_one(
            {"user_id": user["id"]}, {"_id": 0, "email_token_hash": 0, "domain_token": 0}
        )
    return {
        "password_policy": PASSWORD_POLICY,
        "role": user["role"],
        "consent": user.get("consent"),
        "recruiter_verification": verification,
        "google_enabled": True,
    }


@api_router.get("/me/audit")
async def audit_logs(user: Dict[str, Any] = Depends(current_user)) -> List[Dict[str, Any]]:
    return await db.audit_logs.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.get("/me/export")
async def export_data(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    user_data = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    applications = await db.applications.find({"candidate_id": user["id"]}, {"_id": 0}).to_list(500)
    jobs = (
        await db.jobs.find({"recruiter_id": user["id"]}, {"_id": 0}).to_list(500)
        if user.get("role") == "recruiter"
        else []
    )
    messages = await db.messages.find(
        {"sender_id": user["id"]}, {"_id": 0}
    ).to_list(1000)
    notifications = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    await audit(db, user["id"], "privacy.data_exported", {})
    return {
        "generated_at": now_iso(),
        "user": user_data,
        "applications": applications,
        "jobs": jobs,
        "messages": messages,
        "notifications": notifications,
    }


@api_router.delete("/me")
async def delete_account(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, str]:
    await db.users.delete_one({"id": user["id"]})
    await db.user_sessions.delete_many({"user_id": user["id"]})
    await db.recruiter_verifications.delete_many({"user_id": user["id"]})
    await db.audit_logs.delete_many({"user_id": user["id"]})
    await db.applications.delete_many({"candidate_id": user["id"]})
    await db.notifications.delete_many({"user_id": user["id"]})
    await db.messages.delete_many({"sender_id": user["id"]})
    await db.video_rooms.update_many({"owner_id": user["id"]}, {"$set": {"status": "closed", "retention_deleted_at": now_iso()}})
    if user.get("role") == "recruiter":
        await db.jobs.delete_many({"recruiter_id": user["id"]})
    return {"message": "Conta e dados pessoais removidos"}


# --------------------------- AI resume ---------------------------


async def generate_resume(profile: Dict[str, Any], job: Dict[str, Any]) -> Dict[str, Any]:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada no ambiente")
    job_data = json.dumps(
        {key: job.get(key) for key in ["title", "company", "description", "essential_requirements", "differentiators"]},
        ensure_ascii=False,
    )
    profile_data = json.dumps(profile, ensure_ascii=False)
    prompt = (
        "Crie um currículo personalizado em português do Brasil para candidatura à vaga abaixo. "
        "Retorne APENAS JSON válido com as chaves title, summary, highlights, experience, education, skills, cover_note. "
        "Não invente experiências, formação ou habilidades; reorganize apenas o que existe no perfil.\n"
        f"VAGA: {job_data}\nPERFIL: {profile_data}"
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"resume-{uuid.uuid4()}",
        system_message="Você é uma especialista em recrutamento ético e redação de currículos.",
    ).with_model("openai", "gpt-5.4")
    chunks: List[str] = []
    async for event in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(event, TextDelta):
            chunks.append(event.content)
        elif isinstance(event, StreamDone):
            break
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", "".join(chunks).strip(), flags=re.IGNORECASE)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "title": f"Currículo — {job.get('title', 'Vaga')}",
            "summary": raw,
            "highlights": [],
            "experience": [],
            "education": [],
            "skills": profile.get("skills", []),
            "cover_note": "",
        }


@api_router.post("/ai/resume")
async def personalized_resume(data: ResumeInput, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "candidate")
    job = await db.jobs.find_one({"id": data.job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    resume = await generate_resume(user.get("profile", {}), job)
    return {"job": {"id": job["id"], "title": job["title"], "company": job["company"]}, "resume": resume}


# --------------------------- App wiring ---------------------------


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@app.on_event("startup")
async def create_security_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.video_rooms.create_index("expires_at", expireAfterSeconds=0)
    await db.audit_logs.create_index("created_at")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.messages.create_index([("application_id", 1), ("created_at", 1)])
    await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    await db.password_resets.create_index("token_hash", unique=True)


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()
