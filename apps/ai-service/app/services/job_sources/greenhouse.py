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


class GreenhouseBoardSource(JobSource):
    """Adapter for official public Greenhouse ATS boards API."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def name(self) -> str:
        return "greenhouse"

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=60, timeout_seconds=12.0)

    def _resolve_slugs(self, query: JobQuery) -> list[str]:
        # Preference: query specific -> query generic company_slugs -> settings env
        slugs = (
            query.greenhouse_boards or query.company_slugs or self._settings.greenhouse_boards_list
        )
        return [s.strip().lower() for s in slugs if s.strip()]

    async def _fetch_board_jobs(self, slug: str, client: httpx.AsyncClient) -> list[dict[str, Any]]:
        url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
        try:
            data = await self.fetch_json(url, params={"content": "true"}, client=client)
            return data.get("jobs", []) if isinstance(data, dict) else []
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                logger.warning("Greenhouse board '%s' not found (404), skipping.", slug)
                return []
            logger.error("Greenhouse board '%s' HTTP error: %s", slug, exc)
            return []
        except Exception as exc:
            logger.error("Greenhouse board '%s' fetch error: %s", slug, exc)
            return []

    async def search(self, query: JobQuery) -> list[JobPosting]:
        slugs = self._resolve_slugs(query)
        if not slugs:
            logger.info("GreenhouseBoardSource: No company board slugs specified.")
            return []

        postings: list[JobPosting] = []
        keywords_list = [k.lower() for k in query.keywords.split() if k.strip()]

        timeout = httpx.Timeout(self.rate_limit.timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            board_tasks = [self._fetch_board_jobs(slug, client) for slug in slugs]
            results = await asyncio.gather(*board_tasks, return_exceptions=True)

        for slug, board_result in zip(slugs, results, strict=False):
            if isinstance(board_result, BaseException):
                logger.warning("Board %s raised exception: %s", slug, board_result)
                continue

            company_display = slug.replace("-", " ").title()

            for item in board_result:
                title = str(item.get("title", "")).strip()
                if not title:
                    continue

                raw_content = item.get("content", "")
                description = strip_html(raw_content)

                loc_dict = item.get("location") or {}
                location = loc_dict.get("name", "Unspecified")

                is_remote = "remote" in location.lower() or "remote" in title.lower()
                if query.remote_only and not is_remote:
                    continue

                if keywords_list:
                    match_corpus = f"{title} {description[:500]}".lower()
                    if not any(k in match_corpus for k in keywords_list):
                        continue

                if query.location:
                    loc_matches = query.location.lower() in location.lower() or (
                        is_remote and "remote" in query.location.lower()
                    )
                    if not loc_matches:
                        continue

                skills = extract_skills(description)
                seniority = detect_seniority(title, description)

                if query.seniority and seniority != query.seniority.lower():
                    continue

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
                if len(postings) >= query.limit:
                    return postings

        return postings
