from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import detect_seniority, strip_html
from app.services.job_sources.skill_extractor import extract_skills

logger = logging.getLogger("ai_service.job_sources.arbeitnow")


class ArbeitnowSource(JobSource):
    """Adapter for the official public Arbeitnow Job Board API.

    Fetches first 3 pages and normalizes without internal filtering.
    All filtering happens in the aggregator stage.
    """

    API_URL = "https://www.arbeitnow.com/api/job-board-api"

    @property
    def name(self) -> str:
        return "arbeitnow"

    @property
    def display_name(self) -> str:
        return "Arbeitnow"

    @property
    def native_filters(self) -> list[str]:
        # Adapters do not apply preference filters internally
        return []

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=30, timeout_seconds=15.0)

    async def _fetch_page(self, page_num: int) -> list[dict[str, Any]]:
        params = {"page": page_num}
        try:
            data = await self.fetch_json(self.API_URL, params=params)
            return data.get("data", []) if isinstance(data, dict) else []
        except Exception as exc:
            logger.warning("Arbeitnow page %d fetch failed: %s", page_num, exc)
            return []

    async def search(self, query: JobQuery) -> list[JobPosting]:
        self._last_query_sent = "pages=1..3"

        # Fetch first 3 pages concurrently
        tasks = [self._fetch_page(p) for p in (1, 2, 3)]
        pages_data = await asyncio.gather(*tasks, return_exceptions=True)

        seen_ids: set[str] = set()
        postings: list[JobPosting] = []

        for page_result in pages_data:
            if isinstance(page_result, BaseException):
                continue

            for item in page_result:
                ext_id = str(item.get("slug") or item.get("id", "")).strip()
                if not ext_id or ext_id in seen_ids:
                    continue
                seen_ids.add(ext_id)

                title = str(item.get("title", "")).strip()
                if not title:
                    continue

                company = str(item.get("company_name", "Unknown")).strip()
                raw_desc = item.get("description", "")
                description = strip_html(raw_desc)
                tags = item.get("tags", [])
                location = item.get("location") or "Remote"
                is_remote = bool(item.get("remote", False))

                # Parse creation timestamp
                posted_at_iso = None
                raw_created = item.get("created_at")
                if isinstance(raw_created, int | float):
                    posted_at_iso = datetime.fromtimestamp(raw_created, UTC).isoformat()

                skills = extract_skills(description, tags)
                seniority = detect_seniority(title, description)

                posting = JobPosting(
                    source=self.name,
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=location,
                    remote=is_remote,
                    salary_min=None,
                    salary_max=None,
                    currency=None,
                    description=description,
                    url=str(item.get("url", "")),
                    posted_at=posted_at_iso,
                    skills_required=skills,
                    seniority=seniority,
                    is_demo=False,
                )
                postings.append(posting)

        return postings
