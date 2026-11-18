from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "error"] = "ok"
    service: str = "ai-service"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ReadyResponse(BaseModel):
    status: Literal["ready", "not_ready", "error"] = "ready"
    service: str = "ai-service"
    model_loaded: bool = True
    model_name: str | None = None
    detail: str | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class VersionResponse(BaseModel):
    service: str = "ai-service"
    git_sha: str = "dev"
    build_time: str = "unknown"
    pipeline_version: str = "2026-11-17-v3"
