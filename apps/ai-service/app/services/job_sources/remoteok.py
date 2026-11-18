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

logger = logging.getLogger("ai_service.job_sources.remoteok")


class RemoteOKSource(JobSource):
    """Adapter for the public RemoteOK API (https://remoteok.com/api)."""

    API_URL = "https://remoteok.com/api"

    @property
    def name(self) -> str:
        return "remoteok"

    @property
    def display_name(self) -> str:
        return "RemoteOK"

    @property
    def native_filters(self) -> list[str]:
        return []

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=20, timeout_seconds=8.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        self._last_query_sent = "public_api"
        headers = {
            "User-Agent": "JobPilot-Discovery/1.0 (https://jobpilot.app; candidate job search agent)",
            "Accept": "application/json",
        }

        try:
            data = await self.fetch_json(self.API_URL, headers=headers)
        except Exception as exc:
            logger.error("RemoteOK API request failed: %s", exc)
            raise

        if not isinstance(data, list):
            logger.warning("RemoteOK API returned unexpected format: %s", type(data))
            return []

        postings: list[JobPosting] = []
        # The first item in the RemoteOK array is often a metadata/legal notice object
        for item in data:
            if not isinstance(item, dict) or "id" not in item:
                continue

            # Skip non-job entries
            title = item.get("position")
            company = item.get("company")
            if not title or not company:
                continue

            raw_desc = item.get("description", "")
            clean_desc = strip_html(raw_desc)
            tags = item.get("tags") or []
            tag_str = ", ".join(tags) if isinstance(tags, list) else str(tags)
            extracted_skills = extract_skills(f"{title} {tag_str} {clean_desc[:1000]}")

            salary_min, salary_max, currency = parse_salary_range(
                f"{item.get('salary_min', '')} - {item.get('salary_max', '')}"
            )

            job_id = str(item.get("id"))
            canonical_url = item.get("url") or f"https://remoteok.com/l/{job_id}"

            postings.append(
                JobPosting(
                    source="remoteok",
                    external_id=f"remoteok-{job_id}",
                    title=str(title).strip(),
                    company=str(company).strip(),
                    location=item.get("location") or "Remote",
                    remote=True,
                    description=clean_desc,
                    skills_required=extracted_skills,
                    seniority=detect_seniority(title, clean_desc),
                    employment_type="full-time",
                    salary_min=salary_min,
                    salary_max=salary_max,
                    currency=currency,
                    posted_at=item.get("date"),
                    url=canonical_url,
                )
            )

        logger.info("RemoteOK normalized %d job postings", len(postings))
        return postings
