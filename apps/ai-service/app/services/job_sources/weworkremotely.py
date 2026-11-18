from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from typing import Any

import httpx

from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import (
    detect_seniority,
    parse_salary_range,
    strip_html,
)
from app.services.job_sources.skill_extractor import extract_skills

logger = logging.getLogger("ai_service.job_sources.weworkremotely")


class WeWorkRemotelySource(JobSource):
    """Adapter for We Work Remotely public RSS feeds (programming & devops)."""

    FEEDS = [
        "https://weworkremotely.com/categories/remote-programming-jobs.rss",
        "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
    ]

    @property
    def name(self) -> str:
        return "weworkremotely"

    @property
    def display_name(self) -> str:
        return "We Work Remotely"

    @property
    def native_filters(self) -> list[str]:
        return []

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=20, timeout_seconds=8.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        self._last_query_sent = "programming+devops.rss"
        headers = {
            "User-Agent": "JobPilot-Discovery/1.0 (https://jobpilot.app)",
            "Accept": "application/rss+xml, application/xml, text/xml",
        }

        postings: list[JobPosting] = []
        seen_links: set[str] = set()

        async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
            for feed_url in self.FEEDS:
                try:
                    resp = await client.get(feed_url)
                    self._last_http_status = resp.status_code
                    resp.raise_for_status()
                    root = ET.fromstring(resp.content)
                except Exception as exc:
                    logger.warning("WeWorkRemotely feed failed %s: %s", feed_url, exc)
                    if isinstance(exc, httpx.HTTPStatusError):
                        self._last_http_status = exc.response.status_code
                        self._last_error = f"Blocked by Cloudflare challenge (HTTP {exc.response.status_code})"
                    else:
                        self._last_error = str(exc)
                    continue

                channel = root.find("channel")
                if channel is None:
                    continue

                for item in channel.findall("item"):
                    raw_title = item.findtext("title", "")
                    link = item.findtext("link", "")
                    if not raw_title or not link or link in seen_links:
                        continue

                    seen_links.add(link)
                    # WWR titles are usually formatted as "Company: Position"
                    if ":" in raw_title:
                        company_part, title_part = raw_title.split(":", 1)
                        company = company_part.strip()
                        title = title_part.strip()
                    else:
                        company = "Remote Company"
                        title = raw_title.strip()

                    desc_raw = item.findtext("description", "")
                    clean_desc = strip_html(desc_raw)
                    pub_date = item.findtext("pubDate")
                    guid = item.findtext("guid", link)

                    extracted_skills = extract_skills(f"{title} {clean_desc[:1000]}")
                    salary_min, salary_max, currency = parse_salary_range(clean_desc)

                    postings.append(
                        JobPosting(
                            source="weworkremotely",
                            external_id=f"wwr-{abs(hash(guid))}",
                            title=title,
                            company=company,
                            location="Remote",
                            remote=True,
                            description=clean_desc,
                            skills_required=extracted_skills,
                            seniority=detect_seniority(title, clean_desc),
                            employment_type="full-time",
                            salary_min=salary_min,
                            salary_max=salary_max,
                            currency=currency,
                            posted_at=pub_date,
                            url=link,
                        )
                    )

        logger.info("WeWorkRemotely normalized %d job postings", len(postings))
        return postings
