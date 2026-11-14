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
    groq_model: str = "openai/gpt-oss-120b"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    llm_provider_order: str = "groq,gemini"
    llm_cache_enabled: bool = True
    llm_cache_ttl_seconds: int = 3600
    llm_max_concurrency: int = 10
    llm_max_retries: int = 2
    llm_timeout_seconds: int = 60

    # Job Sources & Company Research
    use_demo_jobs: bool = False
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    adzuna_country: str = "us"
    rapidapi_key: str = ""
    serper_api_key: str = ""
    greenhouse_boards: str = "airbnb,stripe,github,cloudflare,datadog"
    lever_boards: str = "netflix,spotify,palantir,figma"

    @property
    def provider_order_list(self) -> list[str]:
        return [p.strip().lower() for p in self.llm_provider_order.split(",") if p.strip()]

    @property
    def greenhouse_boards_list(self) -> list[str]:
        return [b.strip().lower() for b in self.greenhouse_boards.split(",") if b.strip()]

    @property
    def lever_boards_list(self) -> list[str]:
        return [b.strip().lower() for b in self.lever_boards.split(",") if b.strip()]


def load_settings(*, env_file: str | None = ".env") -> Settings:
    try:
        if env_file is None:
            return Settings(_env_file=None)
        return Settings(_env_file=env_file)
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
