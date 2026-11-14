from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import httpx

from app.schemas.job import JobPosting, JobQuery

logger = logging.getLogger("ai_service.job_sources")


@dataclass(frozen=True)
class RateLimitPolicy:
    """Rate limit and connection policy for job source adapter."""

    requests_per_minute: int = 60
    max_concurrency: int = 5
    timeout_seconds: float = 15.0
    max_retries: int = 2
    backoff_factor: float = 0.5


class JobSource(ABC):
    """Abstract base class for all job board and ATS adapters."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier name of the job source adapter."""
        ...

    @property
    def rate_limit(self) -> RateLimitPolicy:
        """Rate limit and retry policy for this source."""
        return RateLimitPolicy()

    @property
    def is_available(self) -> bool:
        """Indicates whether credentials/prerequisites are satisfied."""
        return True

    @abstractmethod
    async def search(self, query: JobQuery) -> list[JobPosting]:
        """Fetch and normalize job postings matching query parameters."""
        ...

    async def fetch_json(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> Any:
        """Robust HTTP GET with retries, timeout, and backoff."""
        policy = self.rate_limit
        timeout = httpx.Timeout(policy.timeout_seconds)
        default_headers = {
            "User-Agent": "JobPilot-AI-Service/0.1.0 (official public API consumer)",
            "Accept": "application/json",
        }
        if headers:
            default_headers.update(headers)

        retries = 0
        backoff = policy.backoff_factor

        while True:
            try:
                if client is not None:
                    response = await client.get(
                        url, params=params, headers=default_headers, timeout=timeout
                    )
                else:
                    async with httpx.AsyncClient(timeout=timeout) as async_client:
                        response = await async_client.get(
                            url, params=params, headers=default_headers
                        )

                # Retry on rate limiting or 5xx server errors if attempts remain
                transient = response.status_code in (429, 500, 502, 503, 504)
                if transient and retries < policy.max_retries:
                    retries += 1
                    logger.warning(
                        "Source '%s' transient error HTTP %d for %s. Retrying (%d/%d) in %.2fs",
                        self.name,
                        response.status_code,
                        url,
                        retries,
                        policy.max_retries,
                        backoff,
                    )
                    await asyncio.sleep(backoff)
                    backoff *= 2
                    continue

                response.raise_for_status()
                return response.json()

            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if retries < policy.max_retries:
                    retries += 1
                    logger.warning(
                        "Source '%s' network/timeout error (%s). Retrying (%d/%d) in %.2fs",
                        self.name,
                        exc,
                        retries,
                        policy.max_retries,
                        backoff,
                    )
                    await asyncio.sleep(backoff)
                    backoff *= 2
                    continue
                logger.error("Source '%s' failed after %d retries: %s", self.name, retries, exc)
                raise
