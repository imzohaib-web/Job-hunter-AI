from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import detect_seniority, strip_html
from app.services.job_sources.skill_extractor import extract_skills

logger = logging.getLogger("ai_service.job_sources.greenhouse")

TECH_TITLE_KEYWORDS = [
    "developer", "engineer", "programmer", "software", "full stack", "fullstack",
    "frontend", "front-end", "backend", "back-end", "react", "node", "python",
    "ml", "ai", "data", "devops", "qa", "sdet", "cloud", "platform", "infrastructure",
    "architect", "web", "intern", "associate", "analyst", "tech",
]


class GreenhouseBoardSource(JobSource):
    """Adapter for official public Greenhouse ATS boards API.

    Verifies board slugs live, reports jobs per board before filtering, skips 404s,
    and filters by title and skill keywords.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        super().__init__()
        self._settings = settings or get_settings()

    @property
    def name(self) -> str:
        return "greenhouse"

    @property
    def display_name(self) -> str:
        return "Greenhouse"

    @property
    def native_filters(self) -> list[str]:
        return []

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=60, timeout_seconds=6.0, max_retries=0)

    def _resolve_slugs(self, query: JobQuery) -> list[str]:
        slugs = (
            query.greenhouse_boards or query.company_slugs or self._settings.greenhouse_boards_list
        )
        return [s.strip().lower() for s in slugs if s.strip()]

    async def _fetch_board_jobs(
        self, slug: str, client: httpx.AsyncClient
    ) -> tuple[str, list[dict[str, Any]], int]:
        url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
        try:
            data = await self.fetch_json(url, client=client)
            jobs = data.get("jobs", []) if isinstance(data, dict) else []
            logger.info("Greenhouse board '%s': HTTP 200 OK (%d active jobs before filtering)", slug, len(jobs))
            return slug, jobs, 200
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 404:
                logger.warning("Greenhouse board '%s' not found (HTTP 404), skipping.", slug)
            else:
                logger.error("Greenhouse board '%s' HTTP error %d: %s", slug, status, exc)
            return slug, [], status
        except Exception as exc:
            logger.error("Greenhouse board '%s' fetch error: %s", slug, exc)
            return slug, [], 500

    async def search(self, query: JobQuery) -> list[JobPosting]:
        slugs = self._resolve_slugs(query)
        if not slugs:
            logger.info("GreenhouseBoardSource: No company board slugs specified.")
            return []

        self._last_query_sent = f"boards={','.join(slugs)}"
        postings: list[JobPosting] = []

        timeout = httpx.Timeout(self.rate_limit.timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            board_tasks = [self._fetch_board_jobs(slug, client) for slug in slugs]
            results = await asyncio.gather(*board_tasks, return_exceptions=True)

        any_200 = False
        last_status = 200

        # Keywords to match on title
        query_words = [w.lower() for w in query.keywords.split() if len(w) > 2]

        for res in results:
            if isinstance(res, BaseException):
                continue
            slug, board_jobs, status = res
            if status == 200:
                any_200 = True
            else:
                last_status = status

            company_display = slug.replace("-", " ").title()

            for item in board_jobs:
                title = str(item.get("title", "")).strip()
                if not title:
                    continue

                title_lower = title.lower()
                # Filter locally by title and skill keywords
                is_tech = any(k in title_lower for k in TECH_TITLE_KEYWORDS) or any(w in title_lower for w in query_words)
                if not is_tech:
                    continue

                loc_dict = item.get("location") or {}
                location = loc_dict.get("name", "Unspecified")
                is_remote = "remote" in location.lower() or "remote" in title_lower

                raw_content = item.get("content") or ""
                clean_content = strip_html(raw_content) if raw_content else ""
                description = clean_content if clean_content else f"{title} at {company_display} located in {location}. Technical position."
                skills = extract_skills(f"{title} {clean_content}")
                seniority = detect_seniority(title, clean_content)

                posting = JobPosting(
                    source=self.name,
                    external_id=f"{slug}-{item.get('id', '')}",
                    title=title,
                    company=company_display,
                    location=location,
                    remote=is_remote if is_remote else None,
                    salary_min=None,
                    salary_max=None,
                    currency=None,
                    description=description,
                    url=str(item.get("absolute_url", "")),
                    posted_at=item.get("updated_at"),
                    skills_required=skills,
                    seniority=seniority,
                    is_demo=False,
                )
                postings.append(posting)

        self._last_http_status = 200 if any_200 else last_status
        return postings
