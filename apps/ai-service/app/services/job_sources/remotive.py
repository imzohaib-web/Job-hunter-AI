from __future__ import annotations

import logging
from typing import Any

from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import (
    detect_seniority,
    parse_salary_range,
    strip_html,
)
from app.services.job_sources.skill_extractor import extract_skills

logger = logging.getLogger("ai_service.job_sources.remotive")


class RemotiveSource(JobSource):
    """Adapter for the official public Remotive Remote Jobs API.

    Fetches by category (software-dev, data) and normalizes without internal filtering.
    All filtering happens in the aggregator stage.
    """

    API_URL = "https://remotive.com/api/remote-jobs"

    @property
    def name(self) -> str:
        return "remotive"

    @property
    def display_name(self) -> str:
        return "Remotive"

    @property
    def native_filters(self) -> list[str]:
        # Adapters do not apply preference filters internally
        return []

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=30, timeout_seconds=15.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        categories = ["software-dev"]
        query_text = f"{query.keywords} {' '.join(query.role_families or [])}".lower()
        if any(k in query_text for k in ["data", "ai", "machine learning", "ml"]):
            categories.append("data")

        self._last_query_sent = f"categories={','.join(categories)}"
        seen_ids: set[str] = set()
        postings: list[JobPosting] = []

        for cat in categories:
            params: dict[str, Any] = {"category": cat}
            try:
                data = await self.fetch_json(self.API_URL, params=params)
            except Exception as exc:
                logger.error("Remotive API request failed for category %s: %s", cat, exc)
                # If software-dev failed, re-raise; if secondary category failed, continue
                if cat == categories[0] and not postings:
                    raise
                continue

            raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []

            for item in raw_jobs:
                ext_id = str(item.get("id", "")).strip()
                if not ext_id or ext_id in seen_ids:
                    continue
                seen_ids.add(ext_id)

                title = str(item.get("title", "")).strip()
                if not title:
                    continue

                company = str(item.get("company_name", "Unknown")).strip()
                raw_desc = item.get("description", "")
                description = strip_html(raw_desc)
                location = item.get("candidate_required_location") or "Remote"
                job_url = item.get("url") or ""

                salary_min, salary_max, currency = parse_salary_range(item.get("salary"))
                skills = extract_skills(description, item.get("tags"))
                seniority = detect_seniority(title, description)

                # Detect employment type if available
                emp_type = item.get("job_type")
                if isinstance(emp_type, str):
                    emp_type = emp_type.lower().replace("_", "-")
                else:
                    emp_type = None

                posting = JobPosting(
                    source=self.name,
                    external_id=ext_id,
                    title=title,
                    company=company,
                    location=location,
                    remote=True,
                    salary_min=salary_min,
                    salary_max=salary_max,
                    currency=currency,
                    description=description,
                    url=job_url,
                    posted_at=item.get("publication_date"),
                    skills_required=skills,
                    seniority=seniority,
                    employment_type=emp_type,
                    is_demo=False,
                )
                postings.append(posting)

        return postings
