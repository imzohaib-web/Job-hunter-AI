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

logger = logging.getLogger("ai_service.job_sources.jobicy")


class JobicySource(JobSource):
    """Adapter for the public Jobicy Remote Jobs API (https://jobicy.com/api/v2/remote-jobs)."""

    API_URL = "https://jobicy.com/api/v2/remote-jobs"

    @property
    def name(self) -> str:
        return "jobicy"

    @property
    def display_name(self) -> str:
        return "Jobicy"

    @property
    def native_filters(self) -> list[str]:
        return []

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=30, timeout_seconds=8.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        params = {"count": 50, "industry": "engineering"}
        self._last_query_sent = "industry=engineering&count=50"
        headers = {
            "User-Agent": "JobPilot-Discovery/1.0 (https://jobpilot.app)",
            "Accept": "application/json",
        }

        try:
            data = await self.fetch_json(self.API_URL, params=params, headers=headers)
        except Exception as exc:
            logger.error("Jobicy API request failed: %s", exc)
            raise

        jobs_list = data.get("jobs", []) if isinstance(data, dict) else []
        postings: list[JobPosting] = []

        for item in jobs_list:
            if not isinstance(item, dict):
                continue

            job_id = str(item.get("id"))
            title = item.get("jobTitle")
            company = item.get("companyName")
            if not title or not company:
                continue

            raw_desc = item.get("jobDescription") or item.get("jobExcerpt") or ""
            clean_desc = strip_html(raw_desc)
            extracted_skills = extract_skills(f"{title} {clean_desc[:1000]}")

            salary_min = None
            salary_max = None
            currency = None
            if item.get("annualSalaryMin") or item.get("annualSalaryMax"):
                try:
                    salary_min = float(item.get("annualSalaryMin")) if item.get("annualSalaryMin") else None
                    salary_max = float(item.get("annualSalaryMax")) if item.get("annualSalaryMax") else None
                    currency = item.get("salaryCurrency") or "USD"
                except Exception:
                    pass

            emp_type = item.get("jobType") or "full-time"
            if isinstance(emp_type, list) and emp_type:
                emp_type = emp_type[0]

            postings.append(
                JobPosting(
                    source="jobicy",
                    external_id=f"jobicy-{job_id}",
                    title=str(title).strip(),
                    company=str(company).strip(),
                    location=item.get("jobGeo") or "Remote",
                    remote=True,
                    description=clean_desc,
                    skills_required=extracted_skills,
                    seniority=detect_seniority(title, clean_desc),
                    employment_type=str(emp_type).lower(),
                    salary_min=salary_min,
                    salary_max=salary_max,
                    currency=currency,
                    posted_at=item.get("pubDate"),
                    url=item.get("url") or f"https://jobicy.com/jobs/{job_id}",
                )
            )

        logger.info("Jobicy normalized %d job postings", len(postings))
        return postings
