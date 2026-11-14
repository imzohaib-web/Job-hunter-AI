from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import detect_seniority, strip_html
from app.services.job_sources.skill_extractor import extract_skills

logger = logging.getLogger("ai_service.job_sources.lever")


class LeverBoardSource(JobSource):
    """Adapter for official public Lever ATS postings API."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def name(self) -> str:
        return "lever"

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=60, timeout_seconds=12.0)

    def _resolve_slugs(self, query: JobQuery) -> list[str]:
        slugs = query.lever_boards or query.company_slugs or self._settings.lever_boards_list
        return [s.strip().lower() for s in slugs if s.strip()]

    async def _fetch_board_jobs(self, slug: str, client: httpx.AsyncClient) -> list[dict[str, Any]]:
        url = f"https://api.lever.co/v0/postings/{slug}"
        try:
            data = await self.fetch_json(url, params={"mode": "json"}, client=client)
            return data if isinstance(data, list) else []
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                logger.warning("Lever board '%s' not found (404), skipping.", slug)
                return []
            logger.error("Lever board '%s' HTTP error: %s", slug, exc)
            return []
        except Exception as exc:
            logger.error("Lever board '%s' fetch error: %s", slug, exc)
            return []

    async def search(self, query: JobQuery) -> list[JobPosting]:
        slugs = self._resolve_slugs(query)
        if not slugs:
            logger.info("LeverBoardSource: No company board slugs specified.")
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
                title = str(item.get("text", "")).strip()
                if not title:
                    continue

                categories = item.get("categories") or {}
                location = categories.get("location") or "Unspecified"
                workplace_type = str(item.get("workplaceType", "")).lower()

                is_remote = (
                    workplace_type == "remote"
                    or "remote" in location.lower()
                    or "remote" in title.lower()
                )
                if query.remote_only and not is_remote:
                    continue

                # Combine description and lists
                desc_parts: list[str] = [item.get("description", "")]
                for lst in item.get("lists", []):
                    if isinstance(lst, dict):
                        header = lst.get("text", "")
                        content = lst.get("content", "")
                        desc_parts.append(f"<h3>{header}</h3>\n{content}")
                full_raw_desc = "\n".join(desc_parts)
                description = strip_html(full_raw_desc)

                if keywords_list:
                    match_corpus = f"{title} {description[:500]}".lower()
                    if not any(k in match_corpus for k in keywords_list):
                        continue

                if query.location:
                    matches_loc = query.location.lower() in location.lower() or (
                        is_remote and "remote" in query.location.lower()
                    )
                    if not matches_loc:
                        continue

                # Parse creation timestamp
                posted_at_iso = None
                raw_created = item.get("createdAt")
                if isinstance(raw_created, int | float):
                    # Lever returns timestamp in milliseconds
                    posted_at_iso = datetime.fromtimestamp(raw_created / 1000.0, UTC).isoformat()

                skills = extract_skills(description)
                seniority = detect_seniority(title, description)

                if query.seniority and seniority != query.seniority.lower():
                    continue

                job_url = item.get("hostedUrl") or item.get("applyUrl") or ""

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
                    url=str(job_url),
                    posted_at=posted_at_iso,
                    skills_required=skills,
                    seniority=seniority,
                    is_demo=False,
                )
                postings.append(posting)
                if len(postings) >= query.limit:
                    return postings

        return postings
