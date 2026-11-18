from __future__ import annotations

from datetime import UTC, datetime
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

logger = logging.getLogger("ai_service.job_sources.himalayas")


class HimalayasSource(JobSource):
    """Adapter for the public Himalayas Remote Jobs API (https://himalayas.app/jobs/api)."""

    API_URL = "https://himalayas.app/jobs/api"

    @property
    def name(self) -> str:
        return "himalayas"

    @property
    def display_name(self) -> str:
        return "Himalayas"

    @property
    def native_filters(self) -> list[str]:
        return []

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=30, timeout_seconds=8.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        params = {"limit": 50}
        self._last_query_sent = "limit=50"
        headers = {
            "User-Agent": "JobPilot-Discovery/1.0 (https://jobpilot.app)",
            "Accept": "application/json",
        }

        try:
            data = await self.fetch_json(self.API_URL, params=params, headers=headers)
        except Exception as exc:
            logger.error("Himalayas API request failed: %s", exc)
            raise

        jobs_list = data.get("jobs", []) if isinstance(data, dict) else []
        postings: list[JobPosting] = []

        for item in jobs_list:
            if not isinstance(item, dict):
                continue

            title = item.get("title")
            company = item.get("companyName")
            if not title or not company:
                continue

            job_id = str(item.get("id") or item.get("guid") or item.get("slug") or hash(f"{company}-{title}"))
            raw_desc = item.get("description") or item.get("excerpt") or ""
            clean_desc = strip_html(raw_desc)

            loc_restrictions = item.get("locationRestrictions") or []
            if isinstance(loc_restrictions, list) and loc_restrictions:
                loc_str = ", ".join(loc_restrictions)
            else:
                loc_str = "Remote"

            extracted_skills = extract_skills(f"{title} {clean_desc[:1000]}")

            salary_min = None
            salary_max = None
            currency = None
            if item.get("minSalary") or item.get("maxSalary"):
                try:
                    salary_min = float(item.get("minSalary")) if item.get("minSalary") else None
                    salary_max = float(item.get("maxSalary")) if item.get("maxSalary") else None
                    currency = item.get("currency") or "USD"
                except Exception:
                    pass

            app_link = item.get("applicationLink") or item.get("url") or f"https://himalayas.app/companies/{company}/jobs/{job_id}"

            pub_val = item.get("pubDate") or item.get("createdAt")
            posted_at_str = None
            if isinstance(pub_val, (int, float)):
                try:
                    posted_at_str = datetime.fromtimestamp(pub_val, UTC).isoformat()
                except Exception:
                    posted_at_str = datetime.now(UTC).isoformat()
            elif pub_val:
                posted_at_str = str(pub_val)
            else:
                posted_at_str = datetime.now(UTC).isoformat()

            postings.append(
                JobPosting(
                    source="himalayas",
                    external_id=f"himalayas-{job_id}",
                    title=str(title).strip(),
                    company=str(company).strip(),
                    location=loc_str,
                    remote=True,
                    description=clean_desc,
                    skills_required=extracted_skills,
                    seniority=detect_seniority(title, clean_desc),
                    employment_type=str(item.get("employmentType") or "full-time").lower(),
                    salary_min=salary_min,
                    salary_max=salary_max,
                    currency=currency,
                    posted_at=posted_at_str,
                    url=app_link,
                )
            )

        logger.info("Himalayas normalized %d job postings", len(postings))
        return postings
