from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings, get_settings
from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import detect_seniority, strip_html
from app.services.job_sources.skill_extractor import extract_skills

logger = logging.getLogger("ai_service.job_sources.adzuna")

COUNTRY_CURRENCIES: dict[str, str] = {
    "us": "USD",
    "gb": "GBP",
    "de": "EUR",
    "fr": "EUR",
    "ca": "CAD",
    "au": "AUD",
}


class AdzunaSource(JobSource):
    """Adapter for Adzuna Jobs API (skips gracefully if app id/key missing)."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def name(self) -> str:
        return "adzuna"

    @property
    def is_available(self) -> bool:
        return bool(self._settings.adzuna_app_id.strip() and self._settings.adzuna_app_key.strip())

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=30, timeout_seconds=15.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        if not self.is_available:
            logger.info("AdzunaSource: ADZUNA_APP_ID/KEY not configured, skipping gracefully.")
            return []

        country = (self._settings.adzuna_country or "us").lower()
        url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"

        params: dict[str, Any] = {
            "app_id": self._settings.adzuna_app_id,
            "app_key": self._settings.adzuna_app_key,
            "results_per_page": min(query.limit, 50),
            "content-type": "application/json",
        }
        if query.keywords:
            params["what"] = query.keywords
        if query.location:
            params["where"] = query.location

        try:
            data = await self.fetch_json(url, params=params)
        except Exception as exc:
            logger.error("Adzuna API request failed: %s", exc)
            raise

        raw_results = data.get("results", [])
        postings: list[JobPosting] = []
        default_currency = COUNTRY_CURRENCIES.get(country, "USD")

        for item in raw_results:
            title = strip_html(item.get("title", ""))
            if not title:
                continue

            company_data = item.get("company") or {}
            company = company_data.get("display_name", "Unknown")

            location_data = item.get("location") or {}
            location = location_data.get("display_name", "Unspecified")

            raw_desc = item.get("description", "")
            description = strip_html(raw_desc)

            is_remote = "remote" in location.lower() or "remote" in title.lower()
            if query.remote_only and not is_remote:
                continue

            salary_min = item.get("salary_min")
            salary_max = item.get("salary_max")
            if salary_min is not None:
                salary_min = float(salary_min)
            if salary_max is not None:
                salary_max = float(salary_max)

            # Ensure valid bounds
            if salary_min is not None and salary_max is not None and salary_max < salary_min:
                salary_min, salary_max = salary_max, salary_min

            skills = extract_skills(description)
            seniority = detect_seniority(title, description)

            if query.seniority and seniority != query.seniority.lower():
                continue

            posting = JobPosting(
                source=self.name,
                external_id=str(item.get("id", "")),
                title=title,
                company=company,
                location=location,
                remote=is_remote if is_remote else None,
                salary_min=salary_min,
                salary_max=salary_max,
                currency=default_currency if (salary_min or salary_max) else None,
                description=description,
                url=str(item.get("redirect_url", "")),
                posted_at=item.get("created"),
                skills_required=skills,
                seniority=seniority,
                is_demo=False,
            )
            postings.append(posting)
            if len(postings) >= query.limit:
                break

        return postings
