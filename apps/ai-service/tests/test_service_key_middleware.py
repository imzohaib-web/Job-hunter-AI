from fastapi.testclient import TestClient


def test_missing_service_key_returns_401(client: TestClient) -> None:
    response = client.get("/docs")
    assert response.status_code == 401
    body = response.json()
    assert body == {
        "error": {
            "code": "UNAUTHORIZED",
            "message": "Invalid or missing X-Service-Key",
        }
    }


def test_invalid_service_key_returns_401(client: TestClient) -> None:
    response = client.get("/docs", headers={"X-Service-Key": "wrong-key"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_valid_service_key_allows_request(
    client: TestClient,
    service_key: str,
) -> None:
    response = client.get("/docs", headers={"X-Service-Key": service_key})
    assert response.status_code == 200
