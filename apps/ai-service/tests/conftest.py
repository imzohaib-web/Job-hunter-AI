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
from app.main import create_app

get_settings.cache_clear()


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
    return TestClient(create_app())


@pytest_asyncio.fixture()
async def async_client(service_key: str) -> AsyncGenerator[AsyncClient, None]:
    _ = service_key
    get_settings.cache_clear()
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
