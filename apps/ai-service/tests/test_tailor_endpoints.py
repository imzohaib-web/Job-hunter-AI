from __future__ import annotations

import io
from unittest.mock import AsyncMock

import pytest
from docx import Document
from fastapi.testclient import TestClient

from app.schemas.fabrication import FabricationReport
from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience
from app.schemas.tailoring import AtsReport, KeywordPlanItem, ResumeChange, TailoredResume


def make_profile() -> ParsedProfile:
    return ParsedProfile(
        name="Sarah Connor",
        email="sarah@example.com",
        phone="+1-555-0100",
        summary="Python developer with FastAPI experience.",
        skills=[
            ProfileSkill(name="Python", category="Languages"),
            ProfileSkill(name="FastAPI", category="Frameworks"),
        ],
        experience=[
            WorkExperience(
                company="Cyberdyne",
                title="Software Engineer",
                start="2020-01",
                end="Present",
                bullets=["Built Python backend microservices."],
                technologies=["Python", "FastAPI"],
            )
        ],
    )


def make_job() -> JobPosting:
    return JobPosting(
        source="remotive",
        external_id="job-99",
        title="Python Engineer",
        company="TechCorp",
        location="Remote",
        remote=True,
        skills_required=["Python", "FastAPI"],
        description="We are hiring a Python and FastAPI backend developer.",
        url="https://example.com/job/99",
    )


def test_tailor_resume_endpoint_requires_auth(client: TestClient) -> None:
    payload = {
        "profile": make_profile().model_dump(),
        "job": make_job().model_dump(),
    }
    response = client.post("/v1/tailor-resume", json=payload)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_tailor_resume_endpoint_success(
    client: TestClient,
    service_key: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_tailored = TailoredResume(
        sections=make_profile(),
        changes=[
            ResumeChange(
                section="summary",
                before="old summary",
                after="new summary",
                reason="Tailoring for job alignment",
                source_fact_ref="profile.summary",
            )
        ],
        keyword_plan=[
            KeywordPlanItem(
                keyword="Python",
                category="required",
                evidence="profile.skills[0]",
                is_gap=False,
            )
        ],
        ats_report=AtsReport(
            keyword_coverage=100.0,
            missing_keywords=[],
            section_checks=[],
        ),
        fabrication_report=FabricationReport(
            claims_checked=2,
            unsupported_claims=[],
            passed=True,
        ),
    )
    monkeypatch.setattr(
        "app.api.v1.ResumeTailorAgent.tailor_resume",
        AsyncMock(return_value=fake_tailored),
    )

    headers = {"X-Service-Key": service_key}
    payload = {
        "profile": make_profile().model_dump(),
        "job": make_job().model_dump(),
    }
    response = client.post("/v1/tailor-resume", headers=headers, json=payload)

    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "meta" in body
    data = body["data"]

    assert "sections" in data
    assert "changes" in data
    assert "keyword_plan" in data
    assert "ats_report" in data
    assert "fabrication_report" in data

    # Verify backward compatible route /api/v1/resume/tailor
    compat_res = client.post("/api/v1/resume/tailor", headers=headers, json=payload)
    assert compat_res.status_code == 200


def test_export_resume_docx_endpoint(client: TestClient, service_key: str) -> None:
    headers = {"X-Service-Key": service_key}
    payload = {
        "resume": make_profile().model_dump(),
        "target_job_title": "Senior Python Engineer",
    }
    response = client.post("/v1/export-resume-docx", headers=headers, json=payload)

    assert response.status_code == 200
    assert (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        in response.headers["content-type"]
    )
    assert "attachment" in response.headers["content-disposition"]
    assert len(response.content) > 0

    # Parse exported binary docx stream
    doc = Document(io.BytesIO(response.content))
    paragraphs_text = " ".join(p.text for p in doc.paragraphs)
    assert "Sarah Connor" in paragraphs_text
    assert "Cyberdyne" in paragraphs_text


def test_check_fabrication_endpoint(
    client: TestClient,
    service_key: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.api.v1.FabricationChecker._run_llm_claim_verification",
        AsyncMock(return_value=([], 0)),
    )
    headers = {"X-Service-Key": service_key}
    payload = {
        "tailored_text": "Experienced Python engineer with Kubernetes and 99.9% uptime experience.",
        "original_profile": make_profile().model_dump(),
    }
    response = client.post("/v1/check-fabrication", headers=headers, json=payload)

    assert response.status_code == 200
    data = response.json()["data"]
    assert "passed" in data
    assert "unsupported_claims" in data
    # Kubernetes and 99.9% were not in profile -> must fail fabrication check!
    assert data["passed"] is False
    assert len(data["unsupported_claims"]) >= 1
