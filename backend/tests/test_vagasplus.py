"""Regression tests for Vagas+ backend covering auth, RBAC, jobs, notifications, chat, dashboard, video rooms, LGPD, and AI resume."""
import os
import uuid

import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
CAND_EMAIL = "cand-test1@example.com"
REC_EMAIL = "rec-test1@example.com"
PASSWORD = "MinhaSenha1!"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def candidate(api):
    token, user = _login(api, CAND_EMAIL)
    return {"token": token, "user": user}


@pytest.fixture(scope="module")
def recruiter(api):
    token, user = _login(api, REC_EMAIL)
    return {"token": token, "user": user}


def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_root(self, api):
        r = api.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert "Vagas+" in r.json()["message"]

    def test_register_weak_password(self, api):
        email = f"TEST_weak_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "senha123", "role": "candidate"
        })
        # weak password must be rejected. 422 (pydantic) or 400 (custom)
        assert r.status_code in (400, 422), r.text

    def test_register_strong_and_login(self, api):
        email = f"TEST_strong_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "Str0ngPass!wd", "role": "candidate"
        })
        assert r.status_code == 200, r.text
        assert "token" in r.json() and r.json()["user"]["email"] == email.lower()
        # login round-trip
        r2 = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Str0ngPass!wd"})
        assert r2.status_code == 200
        assert "token" in r2.json()

    def test_google_session_invalid(self, api):
        r = api.post(f"{BASE_URL}/api/auth/session", json={"session_id": "invalid_session_id_that_does_not_exist_1234"})
        # backend returns 401 for invalid session
        assert r.status_code in (401, 502), r.text


# ---------- RBAC ----------
class TestRBAC:
    def test_candidate_cannot_create_job(self, api, candidate):
        payload = {
            "title": "TEST Vaga", "company": "TEST Co", "description": "descricao teste longa",
            "essential_requirements": ["Python"], "differentiators": []
        }
        r = api.post(f"{BASE_URL}/api/jobs", json=payload, headers=h(candidate["token"]))
        assert r.status_code == 403, r.text

    def test_candidate_cannot_access_dashboard(self, api, candidate):
        r = api.get(f"{BASE_URL}/api/recruiter/dashboard", headers=h(candidate["token"]))
        assert r.status_code == 403

    def test_recruiter_cannot_update_candidate_profile(self, api, recruiter):
        r = api.put(f"{BASE_URL}/api/me/profile", json={"name": "hack"}, headers=h(recruiter["token"]))
        assert r.status_code == 403


# ---------- Jobs ----------
@pytest.fixture(scope="module")
def created_job(api, recruiter):
    payload = {
        "title": f"TEST Dev {uuid.uuid4().hex[:6]}", "company": "TEST Corp",
        "description": "Vaga TEST para testes automatizados de regressão",
        "essential_requirements": ["Python", "FastAPI"],
        "differentiators": ["Docker"],
    }
    r = api.post(f"{BASE_URL}/api/jobs", json=payload, headers=h(recruiter["token"]))
    assert r.status_code == 200, r.text
    job = r.json()
    assert "_id" not in job
    return job


class TestJobs:
    def test_create_job_and_get_with_match(self, api, candidate, created_job):
        r = api.get(f"{BASE_URL}/api/jobs/{created_job['id']}", headers=h(candidate["token"]))
        assert r.status_code == 200
        body = r.json()
        assert "match" in body
        assert 0 <= body["match"]["score"] <= 100

    def test_list_jobs_candidate_has_match(self, api, candidate, created_job):
        r = api.get(f"{BASE_URL}/api/jobs", headers=h(candidate["token"]))
        assert r.status_code == 200
        jobs = r.json()
        assert isinstance(jobs, list) and len(jobs) >= 1
        for j in jobs:
            assert "match" in j
            assert "_id" not in j


# ---------- Apply + Notifications ----------
@pytest.fixture(scope="module")
def application(api, candidate, created_job):
    r = api.post(
        f"{BASE_URL}/api/jobs/{created_job['id']}/apply",
        json={"resume_text": "TEST resume"},
        headers=h(candidate["token"]),
    )
    assert r.status_code == 200, r.text
    return r.json()["application"]


class TestApplicationAndNotifications:
    def test_application_created(self, application, created_job):
        assert application["job_id"] == created_job["id"]

    def test_recruiter_gets_notification(self, api, recruiter, created_job):
        r = api.get(f"{BASE_URL}/api/notifications", headers=h(recruiter["token"]))
        assert r.status_code == 200
        notifs = r.json()
        matching = [n for n in notifs if n.get("meta", {}).get("job_id") == created_job["id"] and n["kind"] == "application"]
        assert len(matching) >= 1, "Recruiter should get application notification"


# ---------- Chat ----------
class TestChat:
    def test_participants_can_message(self, api, candidate, recruiter, application):
        r = api.post(
            f"{BASE_URL}/api/applications/{application['id']}/messages",
            json={"body": "TEST hello from candidate"},
            headers=h(candidate["token"]),
        )
        assert r.status_code == 200, r.text
        r2 = api.get(f"{BASE_URL}/api/applications/{application['id']}/messages", headers=h(recruiter["token"]))
        assert r2.status_code == 200
        msgs = r2.json()["messages"]
        assert any("TEST hello" in m["body"] for m in msgs)

    def test_third_party_blocked(self, api, application):
        # register a third user
        email = f"TEST_third_{uuid.uuid4().hex[:6]}@example.com"
        reg = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "Str0ngPass!wd", "role": "candidate"
        })
        assert reg.status_code == 200
        third_token = reg.json()["token"]
        r = api.get(f"{BASE_URL}/api/applications/{application['id']}/messages", headers=h(third_token))
        assert r.status_code == 403


# ---------- Dashboard ----------
class TestDashboard:
    def test_recruiter_dashboard(self, api, recruiter):
        r = api.get(f"{BASE_URL}/api/recruiter/dashboard", headers=h(recruiter["token"]))
        assert r.status_code == 200
        body = r.json()
        assert "totals" in body and "stage_totals" in body and "jobs" in body
        assert isinstance(body["jobs"], list)
        assert body["totals"]["jobs"] >= 1


# ---------- Pipeline stage update ----------
class TestPipeline:
    def test_stage_update_notifies_candidate(self, api, recruiter, candidate, created_job, application):
        r = api.patch(
            f"{BASE_URL}/api/jobs/{created_job['id']}/applications/{application['id']}/stage",
            json={"stage": "Entrevista", "score": 80, "notes": "TEST"},
            headers=h(recruiter["token"]),
        )
        assert r.status_code == 200, r.text
        assert r.json()["stage"] == "Entrevista"
        # candidate got a notif
        n = api.get(f"{BASE_URL}/api/notifications", headers=h(candidate["token"]))
        assert n.status_code == 200
        stage_notifs = [x for x in n.json() if x["kind"] == "stage"]
        assert len(stage_notifs) >= 1


# ---------- Video ----------
@pytest.fixture(scope="module")
def video_room(api, recruiter, created_job, application):
    r = api.post(
        f"{BASE_URL}/api/video/rooms",
        json={"job_id": created_job["id"], "application_id": application["id"], "retention_minutes": 60},
        headers=h(recruiter["token"]),
    )
    assert r.status_code == 200, r.text
    return r.json()


class TestVideo:
    def test_join_correct_code_authorized(self, api, candidate, video_room):
        r = api.post(
            f"{BASE_URL}/api/video/rooms/{video_room['room_id']}/join",
            json={"code": video_room["code"]},
            headers=h(candidate["token"]),
        )
        assert r.status_code == 200, r.text
        assert "participant_token" in r.json()

    def test_join_wrong_code(self, api, candidate, video_room):
        r = api.post(
            f"{BASE_URL}/api/video/rooms/{video_room['room_id']}/join",
            json={"code": "wrongcode123"},
            headers=h(candidate["token"]),
        )
        assert r.status_code == 401

    def test_third_party_forbidden(self, api, video_room):
        email = f"TEST_v3_{uuid.uuid4().hex[:6]}@example.com"
        reg = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "Str0ngPass!wd", "role": "candidate"
        })
        assert reg.status_code == 200
        token = reg.json()["token"]
        r = api.post(
            f"{BASE_URL}/api/video/rooms/{video_room['room_id']}/join",
            json={"code": video_room["code"]},
            headers=h(token),
        )
        assert r.status_code == 403


# ---------- LGPD ----------
class TestLGPD:
    def test_consent_and_export(self, api):
        # Use a fresh temporary user to safely test consent + delete
        email = f"TEST_lgpd_{uuid.uuid4().hex[:6]}@example.com"
        reg = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "Str0ngPass!wd", "role": "candidate"
        })
        assert reg.status_code == 200
        token = reg.json()["token"]
        c = api.post(
            f"{BASE_URL}/api/me/consent",
            json={"privacy_version": "1.0", "profile_visibility": "matched_only"},
            headers=h(token),
        )
        assert c.status_code == 200
        assert c.json()["profile_visibility"] == "matched_only"
        exp = api.get(f"{BASE_URL}/api/me/export", headers=h(token))
        assert exp.status_code == 200
        data = exp.json()
        assert "user" in data and "applications" in data and "notifications" in data
        # delete
        d = api.delete(f"{BASE_URL}/api/me", headers=h(token))
        assert d.status_code == 200
        # verify login no longer works
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Str0ngPass!wd"})
        assert r.status_code == 401


# ---------- AI Resume ----------
class TestAIResume:
    def test_generate_resume(self, api, candidate, created_job):
        r = api.post(
            f"{BASE_URL}/api/ai/resume",
            json={"job_id": created_job["id"]},
            headers=h(candidate["token"]),
            timeout=90,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "resume" in body
        resume = body["resume"]
        # loose validation, model may vary
        assert isinstance(resume, dict)
        assert "title" in resume or "summary" in resume
