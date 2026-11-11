from fastapi.testclient import TestClient


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
