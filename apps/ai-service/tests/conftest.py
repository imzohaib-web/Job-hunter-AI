import os
import sys

# Prevent Windows C-extension / protobuf collisions under Python 3.13
if "tensorflow" not in sys.modules:
    sys.modules["tensorflow"] = None
if "pyarrow" not in sys.modules:
    sys.modules["pyarrow"] = None

# Ensure settings/app import succeeds before fixtures run.
os.environ.setdefault("AI_SERVICE_KEY", "test-ai-service-key")

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings

get_settings.cache_clear()


@pytest.fixture(autouse=True)
def mock_embeddings_globally(monkeypatch: pytest.MonkeyPatch):
    """Prevent slow PyTorch / SentenceTransformer model loading in unit tests."""
    fake_vector = [0.05] * 384

    def _fake_batch_encode(texts, *args, **kwargs):
        return [fake_vector for _ in texts]

    async def _fake_async_batch_encode(texts, *args, **kwargs):
        return [fake_vector for _ in texts]

    class _FakeModel:
        def encode(self, texts, *args, **kwargs):
            return [fake_vector for _ in texts]

    monkeypatch.setattr("app.embeddings.model.batch_encode", _fake_batch_encode)
    monkeypatch.setattr("app.embeddings.model.async_batch_encode", _fake_async_batch_encode)
    monkeypatch.setattr("app.embeddings.model.get_embedding_model", lambda: _FakeModel())
    monkeypatch.setattr("app.embeddings.model.is_model_ready", lambda: True)
    try:
        monkeypatch.setattr("app.services.ranking.agent.async_batch_encode", _fake_async_batch_encode)
        monkeypatch.setattr("app.services.ranking.agent.batch_encode", _fake_batch_encode)
    except Exception:
        pass


@pytest.fixture()
def service_key(monkeypatch: pytest.MonkeyPatch) -> str:
    key = "test-ai-service-key"
    monkeypatch.setenv("AI_SERVICE_KEY", key)
    get_settings.cache_clear()
    return key


@pytest.fixture()
def client(service_key: str) -> TestClient:
    _ = service_key
    get_settings.cache_clear()
    from app.main import create_app
    return TestClient(create_app())


@pytest_asyncio.fixture()
async def async_client(service_key: str) -> AsyncGenerator[AsyncClient, None]:
    _ = service_key
    get_settings.cache_clear()
    from app.main import create_app
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
