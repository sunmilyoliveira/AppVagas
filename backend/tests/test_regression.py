import json
import os

import pytest
import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")


@pytest.fixture(scope="module")
def api():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def no_object_ids(value):
    if isinstance(value, dict):
        assert "_id" not in value
        for child in value.values():
            no_object_ids(child)
    elif isinstance(value, list):
        for child in value:
            no_object_ids(child)


def login(api, email, password):
    response = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["email"] == email
    return body["token"], body["user"]


def test_root_and_auth(api):
    response = api.get(f"{BASE_URL}/api/")
    assert response.status_code == 200
    assert response.json()["message"]
    candidate_token, candidate = login(api, "candidate-9bf1b003@example.com", "senha123")
    recruiter_token, recruiter = login(api, "test-bb58f5a8@example.com", "senha123")
    assert candidate["role"] == "candidate"
    assert recruiter["role"] == "recruiter"
    no_object_ids({"candidate": candidate, "recruiter": recruiter})


def test_candidate_jobs_profile_and_application(api):
    token, user = login(api, "candidate-9bf1b003@example.com", "senha123")
    api.headers.update({"Authorization": f"Bearer {token}"})
    jobs = api.get(f"{BASE_URL}/api/jobs").json()
    assert isinstance(jobs, list) and jobs
    no_object_ids(jobs)
    job = api.get(f"{BASE_URL}/api/jobs/{jobs[0]['id']}").json()
    assert 0 <= job["match"]["score"] <= 100
    profile = {**user.get("profile", {}), "skills": ["Python", "React"]}
    saved = api.put(f"{BASE_URL}/api/me/profile", json=profile)
    assert saved.status_code == 200
    assert saved.json()["profile"]["skills"] == profile["skills"]
    application = api.post(f"{BASE_URL}/api/jobs/{job['id']}/apply", json={"resume_text": "test"})
    assert application.status_code == 200
    no_object_ids(application.json())


def test_recruiter_listing_and_ranking(api):
    token, _ = login(api, "test-bb58f5a8@example.com", "senha123")
    api.headers.update({"Authorization": f"Bearer {token}"})
    jobs = api.get(f"{BASE_URL}/api/recruiter/jobs").json()
    assert isinstance(jobs, list) and jobs
    report = api.get(f"{BASE_URL}/api/jobs/{jobs[0]['id']}/applications")
    assert report.status_code == 200
    body = report.json()
    assert body["total"] == len(body["applications"])
    scores = [item["score"] for item in body["applications"]]
    assert scores == sorted(scores, reverse=True)
    no_object_ids(body)