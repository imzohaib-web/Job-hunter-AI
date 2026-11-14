import os
import sys

# Prevent Windows C-extension / protobuf collisions under Python 3.13
if "tensorflow" not in sys.modules:
    sys.modules["tensorflow"] = None
if "pyarrow" not in sys.modules:
    sys.modules["pyarrow"] = None

# Ensure settings/app import succeeds before fixtures run.
os.environ.setdefault("AI_SERVICE_KEY", "test-ai-service-key")

import pytest
from fastapi.testclient import TestClient

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
