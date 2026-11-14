from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import detect_seniority, strip_html
from app.services.job_sources.skill_extractor import extract_skills

logger = logging.getLogger("ai_service.job_sources.arbeitnow")


class ArbeitnowSource(JobSource):
    """Adapter for the official public Arbeitnow Job Board API."""

    API_URL = "https://www.arbeitnow.com/api/job-board-api"

    @property
    def name(self) -> str:
        return "arbeitnow"

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=30, timeout_seconds=15.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        params: dict[str, Any] = {"page": 1}
        try:
            data = await self.fetch_json(self.API_URL, params=params)
        except Exception as exc:
            logger.error("Arbeitnow API request failed: %s", exc)
            raise

        raw_jobs = data.get("data", [])
        postings: list[JobPosting] = []

        keywords_list = [k.lower() for k in query.keywords.split() if k.strip()]

        for item in raw_jobs:
            title = str(item.get("title", "")).strip()
            if not title:
                continue

            company = str(item.get("company_name", "Unknown")).strip()
            raw_desc = item.get("description", "")
            description = strip_html(raw_desc)
            tags = item.get("tags", [])
            location = item.get("location") or "Remote"
            is_remote = bool(item.get("remote", False))

            if query.remote_only and not is_remote:
                continue

            # Keywords filter
            if keywords_list:
                combined_text = f"{title} {' '.join(tags)} {description[:500]}".lower()
                if not any(k in combined_text for k in keywords_list):
                    continue

            # Location filter
            if query.location:
                loc_match = query.location.lower() in location.lower() or (
                    is_remote and "remote" in query.location.lower()
                )
                if not loc_match:
                    continue

            # Timestamp parsing
            posted_at_iso = None
            raw_created = item.get("created_at")
            if isinstance(raw_created, int | float):
                posted_at_iso = datetime.fromtimestamp(raw_created, UTC).isoformat()

            skills = extract_skills(description, tags)
            seniority = detect_seniority(title, description)

            if query.seniority and seniority != query.seniority.lower():
                continue

            posting = JobPosting(
                source=self.name,
                external_id=str(item.get("slug") or item.get("id", "")),
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
            if len(postings) >= query.limit:
                break

        return postings
