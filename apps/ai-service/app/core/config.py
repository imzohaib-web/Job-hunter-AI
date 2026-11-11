from __future__ import annotations

import sys
from functools import lru_cache

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"

    ai_service_key: str = Field(min_length=1)

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    llm_max_retries: int = 2
    llm_timeout_seconds: int = 60


def load_settings(*, env_file: str | None = ".env") -> Settings:
    try:
        if env_file is None:
            return Settings(_env_file=None)  # type: ignore[call-arg]
        return Settings(_env_file=env_file)  # type: ignore[call-arg]
    except ValidationError as exc:
        lines: list[str] = []
        for err in exc.errors():
            loc = ".".join(str(part) for part in err["loc"])
            lines.append(f"{loc}: {err['msg']}")
        message = "Missing or invalid environment variables:\n" + "\n".join(
            f"  - {line}" for line in lines
        )
        print(message, file=sys.stderr)
        raise SystemExit(1) from exc


@lru_cache
def get_settings() -> Settings:
    return load_settings()
