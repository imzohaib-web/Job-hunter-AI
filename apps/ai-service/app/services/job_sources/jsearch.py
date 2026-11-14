from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from app.core.config import Settings, get_settings
from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import detect_seniority, strip_html
from app.services.job_sources.skill_extractor import extract_skills

logger = logging.getLogger("ai_service.job_sources.jsearch")


class JSearchSource(JobSource):
    """Adapter for RapidAPI JSearch API (optional; skips gracefully if missing)."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def name(self) -> str:
        return "jsearch"

    @property
    def is_available(self) -> bool:
        return bool(self._settings.rapidapi_key.strip())

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=20, timeout_seconds=15.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        if not self.is_available:
            logger.info("JSearchSource: RAPIDAPI_KEY not configured, skipping gracefully.")
            return []

        url = "https://jsearch.p.rapidapi.com/search"
        headers = {
            "x-rapidapi-key": self._settings.rapidapi_key,
            "x-rapidapi-host": "jsearch.p.rapidapi.com",
        }

        search_parts = [query.keywords] if query.keywords else ["developer"]
        if query.location:
            search_parts.append(f"in {query.location}")
        if query.remote_only:
            search_parts.append("remote")

        params: dict[str, Any] = {
            "query": " ".join(search_parts),
            "page": 1,
            "num_pages": 1,
        }

        try:
            data = await self.fetch_json(url, params=params, headers=headers)
        except Exception as exc:
            logger.error("JSearch API request failed: %s", exc)
            raise

        raw_jobs = data.get("data", []) if isinstance(data, dict) else []
        postings: list[JobPosting] = []

        for item in raw_jobs:
            title = strip_html(item.get("job_title", ""))
            if not title:
                continue

            company = str(item.get("employer_name", "Unknown")).strip()
            raw_desc = item.get("job_description", "")
            description = strip_html(raw_desc)

            loc_parts = [
                item.get("job_city"),
                item.get("job_state"),
                item.get("job_country"),
            ]
            loc_str = ", ".join(p for p in loc_parts if p) or "Remote"
            is_remote = bool(item.get("job_is_remote", False))

            if query.remote_only and not is_remote:
                continue

            # Format timestamp
            posted_at_iso = None
            raw_ts = item.get("job_posted_at_timestamp")
            if isinstance(raw_ts, int | float):
                posted_at_iso = datetime.fromtimestamp(raw_ts, UTC).isoformat()

            salary_min = item.get("job_min_salary")
            salary_max = item.get("job_max_salary")
            if salary_min is not None:
                salary_min = float(salary_min)
            if salary_max is not None:
                salary_max = float(salary_max)

            if salary_min is not None and salary_max is not None and salary_max < salary_min:
                salary_min, salary_max = salary_max, salary_min

            currency = item.get("job_salary_currency")
            if currency and len(currency) != 3:
                currency = None

            raw_skills = item.get("job_required_skills")
            skill_list = raw_skills if isinstance(raw_skills, list) else None
            skills = extract_skills(description, skill_list)
            seniority = detect_seniority(title, description)

            if query.seniority and seniority != query.seniority.lower():
                continue

            posting = JobPosting(
                source=self.name,
                external_id=str(item.get("job_id", "")),
                title=title,
                company=company,
                location=loc_str,
                remote=is_remote,
                salary_min=salary_min,
                salary_max=salary_max,
                currency=currency,
                description=description,
                url=str(item.get("job_apply_link", "")),
                posted_at=posted_at_iso,
                skills_required=skills,
                seniority=seniority,
                is_demo=False,
            )
            postings.append(posting)
            if len(postings) >= query.limit:
                break

        return postings
