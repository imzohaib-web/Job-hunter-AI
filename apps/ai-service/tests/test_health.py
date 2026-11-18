from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _mock_preload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.embeddings.model.preload_embedding_model_background",
        AsyncMock(return_value=None),
    )



def test_health_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "ai-service"
    assert "timestamp" in body


def test_health_does_not_require_service_key(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200


def test_ready_when_loaded(client: TestClient) -> None:
    with patch("app.api.health.is_model_ready", return_value=True):
        response = client.get("/ready")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ready"
        assert body["model_loaded"] is True


def test_ready_when_not_loaded(client: TestClient) -> None:
    with patch("app.api.health.is_model_ready", return_value=False):
        response = client.get("/ready")
        assert response.status_code == 503
        body = response.json()
        assert body["status"] == "not_ready"
        assert body["model_loaded"] is False


def test_ready_does_not_require_service_key(client: TestClient) -> None:
    response = client.get("/ready")
    assert response.status_code in (200, 503)


def test_version_endpoint(client: TestClient) -> None:
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "ai-service"
    assert "git_sha" in body
    assert "build_time" in body
    assert body["pipeline_version"] == "2026-11-17-v3"

    # Also test /api/version alias
    response_alias = client.get("/api/version")
    assert response_alias.status_code == 200
    assert response_alias.json()["pipeline_version"] == "2026-11-17-v3"

