from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.schemas.company import CompanyInsight
from app.services.company_research.agent import CompanyResearchAgent


def make_insight(
    company_name: str = "Acme Corp",
    confidence: float = 0.90,
    limitations: list[str] | None = None,
) -> CompanyInsight:
    return CompanyInsight(
        company_name=company_name,
        summary=f"{company_name} is an enterprise cloud and software provider.",
        products_or_services=["Enterprise Cloud", "Developer Tools"],
        industry="Enterprise Software",
        tech_stack=["Python", "FastAPI", "AWS", "PostgreSQL"],
        culture_signals=["Remote-first", "Continuous learning"],
        size_estimate="100-500 employees",
        applicant_notes=["Highlight distributed systems and cloud experience."],
        sources=["https://acme.example.com/about"],
        confidence=confidence,
        limitations=limitations or [],
    )


def test_company_research_endpoint_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/v1/company-research",
        json={"company_name": "Acme Corp", "website_url": "https://acme.example.com"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_company_research_endpoint_v1_success(
    client: TestClient,
    service_key: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_insight = make_insight("Acme Corp", confidence=0.88)
    mock_research = AsyncMock(return_value=fake_insight)
    monkeypatch.setattr(CompanyResearchAgent, "research", mock_research)

    response = client.post(
        "/v1/company-research",
        headers={"X-Service-Key": service_key},
        json={
            "company_name": "Acme Corp",
            "website_url": "https://acme.example.com",
            "raw_context": "Leading SaaS provider.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    data = body["data"]
    assert data["company_name"] == "Acme Corp"
    assert data["confidence"] == 0.88
    assert "Python" in data["tech_stack"]
    assert data["sources"] == ["https://acme.example.com/about"]
    assert body["meta"]["duration_ms"] >= 0


def test_company_research_endpoint_api_alias_success(
    client: TestClient,
    service_key: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_insight = make_insight("Globex", confidence=0.75)
    mock_research = AsyncMock(return_value=fake_insight)
    monkeypatch.setattr(CompanyResearchAgent, "research", mock_research)

    response = client.post(
        "/api/v1/company/research",
        headers={"X-Service-Key": service_key},
        json={
            "company_name": "Globex",
            "company_url": "https://globex.example.com",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["company_name"] == "Globex"


@pytest.mark.parametrize(
    "ssrf_url",
    [
        "http://localhost:8000",
        "http://localhost/admin",
        "http://127.0.0.1:8080/internal",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/dashboard",
        "http://172.16.0.1",
        "http://192.168.1.1",
        "http://[::1]:8080",
        "http://[fd00::1]/",
        "ftp://example.com/file",
        "file:///etc/passwd",
    ],
)
def test_company_research_endpoint_ssrf_blocked_returns_400(
    client: TestClient,
    service_key: str,
    ssrf_url: str,
) -> None:
    response = client.post(
        "/v1/company-research",
        headers={"X-Service-Key": service_key},
        json={
            "company_name": "Target Company",
            "website_url": ssrf_url,
        },
    )

    assert response.status_code == 400
    err = response.json()["error"]
    assert err["code"] == "SSRF_BLOCKED"
    assert "restricted" in err["message"].lower() or "forbidden" in err["message"].lower()


def test_company_research_endpoint_validation_error_422(
    client: TestClient,
    service_key: str,
) -> None:
    # Empty company_name is disallowed
    response = client.post(
        "/v1/company-research",
        headers={"X-Service-Key": service_key},
        json={"company_name": ""},
    )
    assert response.status_code == 422


def test_company_research_endpoint_unreachable_website_graceful(
    client: TestClient,
    service_key: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    low_confidence_insight = make_insight(
        company_name="Offline Corp",
        confidence=0.15,
        limitations=["Could not reach website (Connection refused): https://offline.example.com"],
    )
    mock_research = AsyncMock(return_value=low_confidence_insight)
    monkeypatch.setattr(CompanyResearchAgent, "research", mock_research)

    response = client.post(
        "/v1/company-research",
        headers={"X-Service-Key": service_key},
        json={
            "company_name": "Offline Corp",
            "website_url": "https://offline.example.com",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["confidence"] <= 0.20
    assert len(body["warnings"]) > 0
    assert "Could not reach website" in body["warnings"][0]
