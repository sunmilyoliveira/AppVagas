from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import json
import logging
import os
import re
import uuid

import bcrypt
import jwt
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.getenv("JWT_SECRET", "vaga-ai-local-secret")
EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")

app = FastAPI(title="VagaAI API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_words(value: str) -> set[str]:
    return set(re.findall(r"[a-zA-ZÀ-ÿ0-9]{3,}", value.lower()))


class AuthInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = Field(pattern="^(candidate|recruiter)$")


class LoginInput(BaseModel):
    email: EmailStr
    password: str


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


class ApplyInput(BaseModel):
    resume_text: str = ""
    resume_title: str = "Currículo personalizado"


class ResumeInput(BaseModel):
    job_id: str


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": user["id"], "email": user["email"], "role": user["role"], "profile": user.get("profile", {})}


def make_token(user: Dict[str, Any]) -> str:
    return jwt.encode({"sub": user["id"], "role": user["role"]}, JWT_SECRET, algorithm="HS256")


async def current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Dict[str, Any]:
    if not credentials:
        raise HTTPException(status_code=401, detail="Faça login para continuar")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    return user


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
    advantages = [f"Atende a {len(essential_met)} de {len(job.get('essential_requirements', []))} requisitos imprescindíveis."]
    if differentiators_met:
        advantages.append(f"Possui {len(differentiators_met)} diferencial(is) valorizado(s).")
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
        "fit_summary": f"Compatibilidade de {score}% com foco em requisitos essenciais.",
    }


async def require_role(user: Dict[str, Any], role: str) -> None:
    if user.get("role") != role:
        raise HTTPException(status_code=403, detail="Ação não disponível para este perfil")


@api_router.get("/")
async def root() -> Dict[str, str]:
    return {"message": "VagaAI API online"}


@api_router.post("/auth/register")
async def register(data: AuthInput) -> Dict[str, Any]:
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
    return {"token": make_token(user), "user": public_user(user)}


@api_router.post("/auth/login")
async def login(data: LoginInput) -> Dict[str, Any]:
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user or not bcrypt.checkpw(data.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    return {"token": make_token(user), "user": public_user(user)}


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
        query["$or"] = [{"title": {"$regex": q.strip(), "$options": "i"}}, {"company": {"$regex": q.strip(), "$options": "i"}}]
    jobs = await db.jobs.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    if user.get("role") == "candidate":
        for job in jobs:
            job["match"] = requirement_match(user.get("profile", {}), job)
    return jobs


@api_router.post("/jobs")
async def create_job(data: JobInput, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "recruiter")
    job = {"id": str(uuid.uuid4()), "recruiter_id": user["id"], "status": "published", "created_at": now_iso(), **data.model_dump()}
    await db.jobs.insert_one(job)
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
    application = {
        "id": str(uuid.uuid4()), "job_id": job_id, "candidate_id": user["id"], "candidate_email": user["email"],
        "candidate_name": user.get("profile", {}).get("name") or user["email"].split("@")[0],
        "profile": user.get("profile", {}), "resume_text": data.resume_text, "resume_title": data.resume_title,
        "created_at": now_iso(), **match,
    }
    await db.applications.update_one({"job_id": job_id, "candidate_id": user["id"]}, {"$set": application}, upsert=True)
    return {"message": "Candidatura enviada", "application": {key: value for key, value in application.items() if key != "profile"}}


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
        "differentiator_fully_met": sum(1 for item in applications if differentiator_total and item.get("differentiator_score") == 100),
        "essential_total": len(job.get("essential_requirements", [])),
        "differentiator_total": differentiator_total,
        "applications": applications,
    }


async def generate_resume(profile: Dict[str, Any], job: Dict[str, Any]) -> Dict[str, Any]:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada no ambiente")
    job_data = json.dumps({key: job.get(key) for key in ["title", "company", "description", "essential_requirements", "differentiators"]}, ensure_ascii=False)
    profile_data = json.dumps(profile, ensure_ascii=False)
    prompt = (
        "Crie um currículo personalizado em português do Brasil para candidatura à vaga abaixo. "
        "Retorne APENAS JSON válido com as chaves title, summary, highlights, experience, education, skills, cover_note. "
        "Não invente experiências, formação ou habilidades; reorganize apenas o que existe no perfil.\n"
        f"VAGA: {job_data}\nPERFIL: {profile_data}"
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"resume-{uuid.uuid4()}", system_message="Você é uma especialista em recrutamento ético e redação de currículos.").with_model("openai", "gpt-5.4")
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
        return {"title": f"Currículo — {job.get('title', 'Vaga')}", "summary": raw, "highlights": [], "experience": [], "education": [], "skills": profile.get("skills", []), "cover_note": ""}


@api_router.post("/ai/resume")
async def personalized_resume(data: ResumeInput, user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    await require_role(user, "candidate")
    job = await db.jobs.find_one({"id": data.job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Vaga não encontrada")
    resume = await generate_resume(user.get("profile", {}), job)
    return {"job": {"id": job["id"], "title": job["title"], "company": job["company"]}, "resume": resume}


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()