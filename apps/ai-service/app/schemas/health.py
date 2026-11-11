from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "error"] = "ok"
    service: str = "ai-service"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
