from __future__ import annotations

import asyncio
import hashlib
import logging
import time

from app.core.config import Settings, get_settings
from app.schemas.job import JobPosting, JobQuery, SearchJobsResult, SourceStatus
from app.services.job_sources.adzuna import AdzunaSource
from app.services.job_sources.arbeitnow import ArbeitnowSource
from app.services.job_sources.base import JobSource
from app.services.job_sources.cleaner import (
    normalize_company,
    normalize_location,
    normalize_title,
)
from app.services.job_sources.demo import DemoSource
from app.services.job_sources.greenhouse import GreenhouseBoardSource
from app.services.job_sources.jsearch import JSearchSource
from app.services.job_sources.lever import LeverBoardSource
from app.services.job_sources.remotive import RemotiveSource

logger = logging.getLogger("ai_service.job_sources.aggregator")


def compute_job_hash(company: str, title: str, location: str) -> str:
    """Hash canonical company, title, and location for cross-board deduplication."""
    norm_c = normalize_company(company)
    norm_t = normalize_title(title)
    norm_l = normalize_location(location)
    raw = f"{norm_c}|{norm_t}|{norm_l}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class JobSourceAggregator:
    """Coordinates concurrent search execution across job sources, deduplicating findings."""

    def __init__(
        self,
        sources: dict[str, JobSource] | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()

        if sources is not None:
            self._sources = sources
        else:
            self._sources = {
                "remotive": RemotiveSource(),
                "arbeitnow": ArbeitnowSource(),
                "adzuna": AdzunaSource(self._settings),
                "greenhouse": GreenhouseBoardSource(self._settings),
                "lever": LeverBoardSource(self._settings),
                "jsearch": JSearchSource(self._settings),
                "demo": DemoSource(self._settings),
            }

    @property
    def registered_sources(self) -> dict[str, JobSource]:
        return self._sources

    async def _execute_source(
        self, source: JobSource, query: JobQuery
    ) -> tuple[str, list[JobPosting] | Exception, float]:
        start = time.perf_counter()
        try:
            results = await source.search(query)
            duration_ms = (time.perf_counter() - start) * 1000
            return source.name, results, duration_ms
        except Exception as exc:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.warning("Job source '%s' encountered error: %s", source.name, exc)
            return source.name, exc, duration_ms

    async def aggregate(self, query: JobQuery) -> SearchJobsResult:
        statuses: list[SourceStatus] = []
        sources_to_run: list[JobSource] = []

        # Determine which sources to query
        if query.sources:
            requested = [s.strip().lower() for s in query.sources if s.strip()]
            for name in requested:
                source = self._sources.get(name)
                if not source:
                    statuses.append(
                        SourceStatus(
                            source=name,
                            status="error",
                            count=0,
                            error=f"Source '{name}' is not registered or supported.",
                        )
                    )
                    continue

                if name == "demo" and not self._settings.use_demo_jobs:
                    # Explicit guard: demo jobs must never be mixed in unless enabled by env
                    statuses.append(
                        SourceStatus(
                            source="demo",
                            status="skipped",
                            count=0,
                            error="Demo source is disabled (USE_DEMO_JOBS=false).",
                        )
                    )
                    continue

                if not source.is_available:
                    statuses.append(
                        SourceStatus(
                            source=name,
                            status="skipped",
                            count=0,
                            error=f"Source '{name}' is not configured (missing credentials).",
                        )
                    )
                    continue

                sources_to_run.append(source)
        else:
            # Default auto-discovery: all available sources
            for name, source in self._sources.items():
                if name == "demo":
                    if self._settings.use_demo_jobs:
                        sources_to_run.append(source)
                    # When USE_DEMO_JOBS=false, omit demo source entirely
                    continue

                if not source.is_available:
                    statuses.append(
                        SourceStatus(
                            source=name,
                            status="skipped",
                            count=0,
                            error=f"Missing credentials for {name}",
                        )
                    )
                    continue

                sources_to_run.append(source)

        # Run selected sources concurrently
        raw_postings: list[JobPosting] = []

        if sources_to_run:
            tasks = [self._execute_source(source, query) for source in sources_to_run]
            results = await asyncio.gather(*tasks, return_exceptions=False)

            for name, outcome, duration_ms in results:
                if isinstance(outcome, Exception):
                    statuses.append(
                        SourceStatus(
                            source=name,
                            status="error",
                            count=0,
                            error=str(outcome),
                            duration_ms=duration_ms,
                        )
                    )
                else:
                    statuses.append(
                        SourceStatus(
                            source=name,
                            status="ok",
                            count=len(outcome),
                            duration_ms=duration_ms,
                        )
                    )
                    raw_postings.extend(outcome)

        # Deduplicate results:
        # 1. By (source, external_id)
        # 2. By hash(normalized company + normalized title + normalized location)
        seen_source_ext: set[tuple[str, str]] = set()
        seen_hashes: set[str] = set()
        deduped_jobs: list[JobPosting] = []

        for job in raw_postings:
            # Source + External ID check
            ext_key = (job.source, job.external_id)
            if ext_key in seen_source_ext:
                continue

            # Content hash check
            job_hash = compute_job_hash(job.company, job.title, job.location)
            if job_hash in seen_hashes:
                continue

            seen_source_ext.add(ext_key)
            seen_hashes.add(job_hash)
            deduped_jobs.append(job)

            if len(deduped_jobs) >= query.limit:
                break

        # Calculate metrics
        sources_responded = sum(1 for s in statuses if s.status == "ok")
        sources_total = len(statuses)

        return SearchJobsResult(
            jobs=deduped_jobs,
            total=len(deduped_jobs),
            sources_responded=sources_responded,
            sources_total=sources_total,
            source_statuses=statuses,
        )
