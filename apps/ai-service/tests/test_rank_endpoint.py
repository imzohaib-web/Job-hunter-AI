from __future__ import annotations

from fastapi.testclient import TestClient

from app.schemas.job import JobPosting
from app.schemas.match import CandidatePreferences, JobWithEmbedding
from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience


def make_payload() -> dict:
    profile = ParsedProfile(
        name="Alex Dev",
        summary="Experienced Python engineer",
        location="Remote",
        skills=[ProfileSkill(name="Python", category="Languages", years=4.0)],
        experience=[
            WorkExperience(
                company="Startup Inc",
                title="Python Developer",
                start="2020-01",
                end="Present",
                bullets=["Built APIs"],
                technologies=["Python", "FastAPI"],
            )
        ],
    )
    job = JobPosting(
        source="remotive",
        external_id="job-101",
        title="Python Backend Engineer",
        company="CloudTech",
        location="Remote",
        remote=True,
        skills_required=["Python"],
        description="We need a Python developer.",
        url="https://example.com/job/101",
    )
    job_item = JobWithEmbedding(job=job)
    prefs = CandidatePreferences(remote_only=True)

    return {
        "profile": profile.model_dump(),
        "jobs": [job_item.model_dump()],
        "preferences": prefs.model_dump(),
        "llm_rerank": False,
    }


def test_rank_endpoint_requires_service_key(client: TestClient) -> None:
    response = client.post("/v1/rank", json=make_payload())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_rank_endpoint_validation_error(client: TestClient, service_key: str) -> None:
    headers = {"X-Service-Key": service_key}
    # jobs is empty list (min_length=1)
    payload = make_payload()
    payload["jobs"] = []

    response = client.post("/v1/rank", headers=headers, json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_rank_endpoint_success(client: TestClient, service_key: str) -> None:
    headers = {"X-Service-Key": service_key}
    response = client.post("/v1/rank", headers=headers, json=make_payload())

    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "meta" in body
    assert "warnings" in body
    assert body["data"]["total"] == 1
    assert body["data"]["unfiltered_count"] == 1
    assert len(body["data"]["ranked_jobs"]) == 1

    first = body["data"]["ranked_jobs"][0]
    assert first["job"]["external_id"] == "job-101"
    assert first["match"]["overall_score"] >= 50
    assert "breakdown" in first["match"]
    assert len(first["embedding"]) == 384


def test_batch_match_route_works(client: TestClient, service_key: str) -> None:
    headers = {"X-Service-Key": service_key}
    payload = make_payload()
    # BatchMatchRequest takes {"profile": ..., "jobs": [JobPosting]}
    batch_payload = {
        "profile": payload["profile"],
        "jobs": [payload["jobs"][0]["job"]],
    }

    response = client.post(
        "/api/v1/jobs/batch-match",
        headers=headers,
        json=batch_payload,
    )
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert len(body["data"]) == 1
    assert body["data"][0]["job_id"] == "job-101"
