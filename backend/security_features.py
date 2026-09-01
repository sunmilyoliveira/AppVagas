from datetime import datetime, timezone
from html import escape
import asyncio
import hashlib
import ipaddress
import os
import re
from html.parser import HTMLParser
from urllib.parse import urlparse

import dns.resolver
import httpx
from fastapi import HTTPException

PASSWORD_POLICY = "A senha deve ter pelo menos 10 caracteres, uma letra maiúscula, uma minúscula, um número e um caractere especial."
PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,}$")
PUBLIC_EMAIL_DOMAINS = {"gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com"}
EMAIL_BASE_URL = "https://integrations.emergentagent.com"


def validate_password(password: str) -> None:
    if not PASSWORD_RE.fullmatch(password):
        raise HTTPException(status_code=422, detail=PASSWORD_POLICY)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def audit(db, user_id: str | None, action: str, metadata: dict | None = None) -> None:
    await db.audit_logs.insert_one({
        "id": token_hash(f"{user_id}:{action}:{datetime.now(timezone.utc).isoformat()}")[:32],
        "user_id": user_id,
        "action": action,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls = set(), []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls.extend(v for k, v in attrs if k.lower() in {"href", "src"} and v)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        return not any(host == item or host.endswith(f".{item}") for item in ("bit.ly", "tinyurl.com", "t.co"))


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("Email template cannot contain form controls")
    body = f"{subject}\n{html}".lower()
    if any(text in body for text in ("reply with your password", "send your password", "card number", "seed phrase")):
        raise ValueError("Unsafe credential request in email template")
    for url in scan.urls:
        parsed = urlparse(url.strip().lower())
        if parsed.scheme in {"mailto", "tel", "cid"}:
            continue
        if parsed.scheme != "https" or not _host_ok(parsed.hostname or "") or parsed.username:
            raise ValueError("Email links must use safe HTTPS URLs")


async def send_verification_email(to: str, token: str) -> None:
    email_key = os.getenv("EMERGENT_EMAIL_KEY", "")
    from_name = os.getenv("EMAIL_FROM_NAME", "Vagas+")
    app_url = os.getenv("APP_PUBLIC_URL", "")
    if not email_key or not app_url.startswith("https://"):
        raise HTTPException(status_code=503, detail="Verificação de e-mail não configurada")
    link = f"{app_url.rstrip('/')}/?verification_token={token}"
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<h2>Valide seu e-mail no {escape(from_name)}</h2>'
        f'<p>Conclua a validação do e-mail corporativo pelo link seguro abaixo:</p>'
        f'<p><a href="{escape(link)}">Validar e-mail corporativo</a></p>'
        f'<p style="font-size:12px;color:#666">Este link expira em 30 minutos. O {escape(from_name)} nunca solicita sua senha por e-mail.</p>'
        "</td></tr></table>"
    )
    _assert_safe_email("Valide seu e-mail corporativo no Vagas+", html)
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            response = await http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": email_key},
                json={"to": [to], "subject": "Valide seu e-mail corporativo no Vagas+", "html": html, "from_name": from_name},
            )
        response.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Não foi possível enviar o e-mail de verificação") from exc


async def send_password_reset_email(to: str, token: str) -> None:
    email_key = os.getenv("EMERGENT_EMAIL_KEY", "")
    from_name = os.getenv("EMAIL_FROM_NAME", "Vagas+")
    app_url = os.getenv("APP_PUBLIC_URL", "")
    if not email_key or not app_url.startswith("https://"):
        raise HTTPException(status_code=503, detail="Envio de e-mail não configurado")
    link = f"{app_url.rstrip('/')}/?reset_token={token}"
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<h2>Redefinir senha do {escape(from_name)}</h2>'
        f'<p>Você pediu para redefinir sua senha. Toque no link seguro abaixo para escolher uma nova senha:</p>'
        f'<p><a href="{escape(link)}">Redefinir minha senha</a></p>'
        f'<p style="font-size:12px;color:#666">Este link expira em 30 minutos e só pode ser usado uma vez. '
        f'Se você não solicitou, ignore este e-mail — o {escape(from_name)} nunca pede sua senha por e-mail.</p>'
        "</td></tr></table>"
    )
    _assert_safe_email("Redefinir senha do Vagas+", html)
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            response = await http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": email_key},
                json={"to": [to], "subject": "Redefinir senha do Vagas+", "html": html, "from_name": from_name},
            )
        response.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Não foi possível enviar o e-mail de redefinição") from exc


async def verify_domain_txt(domain: str, expected_token: str) -> bool:
    def resolve() -> bool:
        try:
            answers = dns.resolver.resolve(f"_vagasplus-verification.{domain}", "TXT", lifetime=4)
            return any(expected_token in "".join(part.decode() if isinstance(part, bytes) else part for part in record.strings) for record in answers)
        except Exception:
            return False
    return await asyncio.to_thread(resolve)