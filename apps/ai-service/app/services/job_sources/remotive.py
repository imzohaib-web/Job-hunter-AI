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
    """Adapter for the official public Remotive Remote Jobs API."""

    API_URL = "https://remotive.com/api/remote-jobs"

    @property
    def name(self) -> str:
        return "remotive"

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=30, timeout_seconds=15.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        params: dict[str, Any] = {}
        if query.keywords:
            params["search"] = query.keywords
        if query.limit:
            params["limit"] = query.limit

        try:
            data = await self.fetch_json(self.API_URL, params=params)
        except Exception as exc:
            logger.error("Remotive API request failed: %s", exc)
            raise

        raw_jobs = data.get("jobs", [])
        postings: list[JobPosting] = []

        for item in raw_jobs:
            title = str(item.get("title", "")).strip()
            if not title:
                continue

            company = str(item.get("company_name", "Unknown")).strip()
            raw_desc = item.get("description", "")
            description = strip_html(raw_desc)
            location = item.get("candidate_required_location") or "Remote"
            job_url = item.get("url") or ""

            # Check location match if specified and not just 'remote'
            if query.location:
                q_loc = query.location.lower()
                loc_lower = location.lower()
                matches_loc = (
                    q_loc in loc_lower or "anywhere" in loc_lower or "worldwide" in loc_lower
                )
                if not matches_loc:
                    continue

            salary_min, salary_max, currency = parse_salary_range(item.get("salary"))
            skills = extract_skills(description, item.get("tags"))
            seniority = detect_seniority(title, description)

            if query.seniority and seniority != query.seniority.lower():
                continue

            posting = JobPosting(
                source=self.name,
                external_id=str(item.get("id", "")),
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
                is_demo=False,
            )
            postings.append(posting)
            if len(postings) >= query.limit:
                break

        return postings
