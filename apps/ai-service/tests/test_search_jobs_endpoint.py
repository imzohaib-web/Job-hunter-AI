from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.schemas.job import JobPosting, SearchJobsResult, SourceStatus


def make_dummy_posting(ext_id: str = "test-1") -> JobPosting:
    return JobPosting(
        source="remotive",
        external_id=ext_id,
        title="Senior Python Engineer",
        company="Acme Corp",
        location="Remote",
        remote=True,
        description="Python backend engineer role",
        url="https://example.com/job/1",
        skills_required=["Python", "FastAPI"],
        seniority="senior",
        is_demo=False,
    )


def test_search_jobs_requires_service_key(client: TestClient) -> None:
    response = client.post(
        "/v1/search-jobs",
        json={"keywords": "python", "limit": 10},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_search_jobs_validation_error(client: TestClient, service_key: str) -> None:
    headers = {"X-Service-Key": service_key}
    # limit must be >= 1 and <= 200
    response = client.post(
        "/v1/search-jobs",
        headers=headers,
        json={"keywords": "python", "limit": 0},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_search_jobs_success_envelope(client: TestClient, service_key: str) -> None:
    headers = {"X-Service-Key": service_key}

    mock_result = SearchJobsResult(
        jobs=[make_dummy_posting()],
        total=1,
        sources_responded=1,
        sources_total=1,
        source_statuses=[SourceStatus(source="remotive", status="ok", count=1, duration_ms=120.0)],
    )

    with patch(
        "app.api.v1.JobSourceAggregator.aggregate",
        new_callable=AsyncMock,
        return_value=mock_result,
    ):
        response = client.post(
            "/v1/search-jobs",
            headers=headers,
            json={"keywords": "Python", "limit": 10},
        )

    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "meta" in body
    assert "warnings" in body
    assert body["data"]["total"] == 1
    assert body["data"]["sources_responded"] == 1
    assert body["data"]["sources_total"] == 1
    assert len(body["data"]["jobs"]) == 1
    assert body["data"]["jobs"][0]["title"] == "Senior Python Engineer"
    assert body["data"]["jobs"][0]["is_demo"] is False
    assert body["meta"]["duration_ms"] >= 0.0


def test_search_jobs_alias_route(client: TestClient, service_key: str) -> None:
    headers = {"X-Service-Key": service_key}

    mock_result = SearchJobsResult(
        jobs=[make_dummy_posting()],
        total=1,
        sources_responded=1,
        sources_total=1,
        source_statuses=[SourceStatus(source="remotive", status="ok", count=1, duration_ms=50.0)],
    )

    with patch(
        "app.api.v1.JobSourceAggregator.aggregate",
        new_callable=AsyncMock,
        return_value=mock_result,
    ):
        response = client.post(
            "/api/v1/jobs/search",
            headers=headers,
            json={"keywords": "Full Stack", "limit": 5},
        )

    assert response.status_code == 200
    assert response.json()["data"]["total"] == 1
