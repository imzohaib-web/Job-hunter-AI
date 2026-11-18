from __future__ import annotations

import asyncio
import datetime
import hashlib
import logging
import re
import time
from typing import Any

from app.core.config import Settings, get_settings
from app.schemas.job import (
    JobPosting,
    JobQuery,
    SearchDiagnostics,
    SearchJobsResult,
    SourceStatus,
)
from app.services.job_sources.adzuna import AdzunaSource
from app.services.job_sources.arbeitnow import ArbeitnowSource
from app.services.job_sources.base import JobSource
from app.services.job_sources.cleaner import (
    collapse_near_duplicates,
    normalize_company,
    normalize_location,
    normalize_title,
)
from app.services.job_sources.demo import DemoSource
from app.services.job_sources.greenhouse import GreenhouseBoardSource
from app.services.job_sources.himalayas import HimalayasSource
from app.services.job_sources.jobicy import JobicySource
from app.services.job_sources.jsearch import JSearchSource
from app.services.job_sources.lever import LeverBoardSource
from app.services.job_sources.location_parser import parse_location
from app.services.job_sources.remoteok import RemoteOKSource
from app.services.job_sources.remotive import RemotiveSource
from app.services.job_sources.role_family import (
    FAMILY_DATA_AI,
    FAMILY_DEVOPS_CLOUD,
    FAMILY_QA,
    FAMILY_SOFTWARE_WEB,
    TECH_FAMILIES,
    classify_role_family,
    is_job_english,
    is_location_compatible_for_candidate,
)
from app.services.job_sources.weworkremotely import WeWorkRemotelySource

logger = logging.getLogger("ai_service.job_sources.aggregator")

ENGINEERING_KEYWORDS: list[str] = [
    "developer",
    "engineer",
    "programmer",
    "software",
    "full stack",
    "fullstack",
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "react",
    "node",
    "python",
    "ml",
    "ai",
    "data",
    "devops",
    "qa",
    "sdet",
    "cloud",
]


def compute_job_hash(company: str, title: str, location: str) -> str:
    """Hash canonical company, title, and location for cross-board deduplication."""
    norm_c = normalize_company(company)
    norm_t = normalize_title(title)
    norm_l = normalize_location(location)
    raw = f"{norm_c}|{norm_t}|{norm_l}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _parse_job_date(posted_at: str | None) -> datetime.datetime | None:
    if not posted_at:
        return None
    try:
        clean = posted_at.replace("Z", "+00:00")
        if "T" in clean:
            return datetime.datetime.fromisoformat(clean)
        return datetime.datetime.fromisoformat(clean).replace(tzinfo=datetime.UTC)
    except Exception:
        return None


def is_role_family_match(job: JobPosting, user_skills: list[str]) -> bool:
    """Check broad engineering role family match via title or skills in description."""
    title_lower = job.title.lower()
    if any(k in title_lower for k in ENGINEERING_KEYWORDS):
        return True

    # 2+ candidate skills appearing in description or job skills
    desc_lower = job.description.lower()
    job_skills_lower = {s.lower() for s in job.skills_required}
    matched = 0
    for sk in user_skills:
        s_clean = sk.lower().strip()
        if not s_clean or len(s_clean) < 2:
            continue
        if s_clean in job_skills_lower or s_clean in desc_lower:
            matched += 1
            if matched >= 2:
                return True

    return False


def apply_local_filters(
    postings: list[JobPosting], query: JobQuery, source: JobSource
) -> tuple[list[JobPosting], list[str]]:
    """Helper to apply post-fetch local filters for sources lacking native parameter support."""
    applied: list[str] = []
    filtered = list(postings)

    # 1. Salary filter
    if query.salary_min is not None and "salary" not in source.native_filters:
        applied.append("salary")
        min_target = query.salary_min
        if query.salary_period == "monthly":
            min_target = min_target * 12
        new_filtered = []
        for j in filtered:
            if j.salary_max is not None:
                j_max = j.salary_max
                if getattr(j, "salary_period", "yearly") == "monthly":
                    j_max = j_max * 12
                if j_max >= min_target:
                    new_filtered.append(j)
            elif not query.hide_without_salary:
                new_filtered.append(j)
        filtered = new_filtered

    # 2. Employment type filter
    if query.employment_types and "employment_types" not in source.native_filters:
        applied.append("employment_type")
        allowed = {et.lower() for et in query.employment_types}
        new_filtered = []
        for j in filtered:
            text = f"{j.title} {j.description} {j.employment_type or ''}".lower()
            if any(et in text for et in allowed):
                new_filtered.append(j)
        filtered = new_filtered

    # 3. Date posted filter
    if query.date_posted and query.date_posted != "all" and "date_posted" not in source.native_filters:
        applied.append("date_posted")
        days_map = {"24h": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30}
        days = days_map.get(query.date_posted, 30)
        cutoff = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=days)
        new_filtered = []
        for j in filtered:
            dt = _parse_job_date(j.posted_at)
            if not dt or dt >= cutoff:
                new_filtered.append(j)
        filtered = new_filtered

    # 4. Must have skills & exclusions
    if query.must_have_skills:
        applied.append("must_have_skills")
        new_filtered = []
        for j in filtered:
            text = f"{j.title} {j.description}".lower()
            j_skills = {s.lower() for s in j.skills_required}
            if all(sk.lower() in j_skills or sk.lower() in text for sk in query.must_have_skills):
                new_filtered.append(j)
        filtered = new_filtered

    if query.excluded_companies:
        applied.append("excluded_companies")
        new_filtered = []
        for j in filtered:
            norm_c = normalize_company(j.company)
            if not any(normalize_company(c) in norm_c for c in query.excluded_companies if c.strip()):
                new_filtered.append(j)
        filtered = new_filtered

    if query.excluded_keywords:
        applied.append("excluded_keywords")
        new_filtered = []
        for j in filtered:
            text = f"{j.title} {j.description}".lower()
            if not any(re.search(r"\b" + re.escape(k.lower().strip()) + r"\b", text) for k in query.excluded_keywords if k.strip()):
                new_filtered.append(j)
        filtered = new_filtered

    return filtered, applied


_AGGREGATOR_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_LOCK: asyncio.Lock | None = None
_CACHE_LOCK_LOOP: asyncio.AbstractEventLoop | None = None
CACHE_TTL_SECONDS = 900.0  # 15 minutes cache


def _get_cache_lock() -> asyncio.Lock:
    global _CACHE_LOCK, _CACHE_LOCK_LOOP
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if _CACHE_LOCK is None or _CACHE_LOCK_LOOP != loop:
        _CACHE_LOCK = asyncio.Lock()
        _CACHE_LOCK_LOOP = loop
    return _CACHE_LOCK


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
                "remoteok": RemoteOKSource(),
                "jobicy": JobicySource(),
                "himalayas": HimalayasSource(),
                "weworkremotely": WeWorkRemotelySource(),
                "adzuna": AdzunaSource(self._settings),
                "greenhouse": GreenhouseBoardSource(self._settings),
                "lever": LeverBoardSource(self._settings),
                "jsearch": JSearchSource(self._settings),
                "demo": DemoSource(self._settings),
            }

    @property
    def registered_sources(self) -> dict[str, JobSource]:
        return self._sources

    def get_source_statuses(self) -> list[dict[str, Any]]:
        """Returns availability and capability metadata for each registered source."""
        info: list[dict[str, Any]] = []
        for name, source in self._sources.items():
            if name == "demo" and not self._settings.use_demo_jobs:
                continue
            info.append({
                "source": name,
                "name": source.display_name,
                "available": source.is_available,
                "reason": source.unavailable_reason,
                "supportedFilters": source.native_filters,
            })
        return info

    async def _execute_source(
        self, source: JobSource, query: JobQuery
    ) -> tuple[str, list[JobPosting] | Exception, float]:
        norm_kw = query.keywords.lower().strip()
        cache_key = f"{source.name}:{norm_kw}"
        now = time.time()

        async with _get_cache_lock():
            if cache_key in _AGGREGATOR_CACHE:
                ts, cached_raw = _AGGREGATOR_CACHE[cache_key]
                if now - ts < CACHE_TTL_SECONDS:
                    logger.info("Serving %d cached raw postings for source '%s' (TTL 15m)", len(cached_raw), source.name)
                    # Rebuild brand-new JobPosting instances on cache hit to prevent shared-mutation bugs
                    fresh_jobs = [JobPosting.model_validate(d) for d in cached_raw]
                    return source.name, fresh_jobs, 0.5

        start = time.perf_counter()
        try:
            results = await asyncio.wait_for(source.search(query), timeout=25.0)
            duration_ms = (time.perf_counter() - start) * 1000
            if isinstance(results, list):
                # Cache only raw immutable serializations
                raw_dumps = [j.model_dump() for j in results]
                async with _get_cache_lock():
                    _AGGREGATOR_CACHE[cache_key] = (now, raw_dumps)
            return source.name, results, duration_ms
        except Exception as exc:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.warning("Job source '%s' encountered error: %s (%s)", source.name, type(exc).__name__, exc)
            return source.name, exc, duration_ms

    async def aggregate(self, query: JobQuery) -> SearchJobsResult:
        statuses: list[SourceStatus] = []
        sources_to_run: list[JobSource] = []

        # Determine which sources to query
        requested_sources = (
            [s.strip().lower() for s in query.sources if s.strip()]
            if query.sources
            else list(self._sources.keys())
        )

        for name in requested_sources:
            source = self._sources.get(name)
            if not source:
                statuses.append(
                    SourceStatus(
                        source=name,
                        status="error",
                        count=0,
                        raw_fetched=0,
                        after_dedupe=0,
                        after_local_filters=0,
                        http_status=404,
                        error=f"Source '{name}' is not registered or supported.",
                    )
                )
                continue

            if name == "demo" and not self._settings.use_demo_jobs:
                statuses.append(
                    SourceStatus(
                        source="demo",
                        status="skipped",
                        count=0,
                        raw_fetched=0,
                        after_dedupe=0,
                        after_local_filters=0,
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
                        raw_fetched=0,
                        after_dedupe=0,
                        after_local_filters=0,
                        error=source.unavailable_reason or "skipped: no API key",
                    )
                )
                continue

            sources_to_run.append(source)

        # 1. Fetch raw postings concurrently from all enabled sources
        source_raw_map: dict[str, list[JobPosting]] = {}
        source_durations: dict[str, float] = {}
        source_errors: dict[str, str] = {}

        if sources_to_run:
            tasks = [self._execute_source(source, query) for source in sources_to_run]
            results = await asyncio.gather(*tasks, return_exceptions=False)

            for name, outcome, duration_ms in results:
                source_durations[name] = duration_ms
                if isinstance(outcome, Exception):
                    source_errors[name] = str(outcome)
                    source_raw_map[name] = []
                else:
                    source_raw_map[name] = outcome

        # 2. Stage 2: Deduplication (raw_fetched >= after_dedupe)
        seen_source_ext: set[tuple[str, str]] = set()
        seen_hashes: set[str] = set()
        deduped_jobs: list[JobPosting] = []
        source_deduped_counts: dict[str, int] = {}

        for name, postings in source_raw_map.items():
            kept_for_source = 0
            for job in postings:
                ext_key = (job.source, job.external_id)
                if ext_key in seen_source_ext:
                    continue

                job_hash = compute_job_hash(job.company, job.title, job.location)
                if job_hash in seen_hashes:
                    continue

                seen_source_ext.add(ext_key)
                seen_hashes.add(job_hash)
                deduped_jobs.append(job)
                kept_for_source += 1

            source_deduped_counts[name] = kept_for_source

        # 2b. Near-duplicate collapse (same company + base title after stripping region suffixes)
        deduped_jobs = collapse_near_duplicates(deduped_jobs)

        # 3. Stage 3: Filtering (after_dedupe >= after_local_filters)
        # STEP 3 Rule: Hard filters apply ONLY to:
        # - excluded keywords
        # - excluded companies
        # - explicitly required fields (from query.required_filters if any)
        # - role family gate (with automatic relaxation if < 10 jobs remain)
        required_fields = set(getattr(query, "required_filters", []))

        filter_counts_total: dict[str, int] = {
            "role_family": 0,
            "language": 0,
            "onsite_abroad": 0,
            "remote_region_restricted": 0,
            "employment_type": 0,
            "experience_level": 0,
            "work_mode": 0,
            "location": 0,
            "date_posted": 0,
            "salary": 0,
            "excluded_keywords": 0,
            "min_skill_overlap": 0,
            "min_score": 0,
        }
        per_source_breakdown: dict[str, dict[str, int]] = {
            name: dict(filter_counts_total) for name in source_raw_map
        }

        cand_country = query.preferred_countries[0] if query.preferred_countries else "Pakistan"
        filtered_jobs: list[JobPosting] = []

        for job in deduped_jobs:
            src = job.source

            # 3a. Language check (German markers & non-English stopwords)
            if not is_job_english(job.title, job.description):
                filter_counts_total["language"] += 1
                per_source_breakdown.setdefault(src, dict(filter_counts_total))["language"] += 1
                continue

            # 3b. Location realism check & location badge parsing
            parsed_loc = parse_location(
                raw_location=job.location,
                is_remote_flag=job.remote,
                description=job.description,
                candidate_country=cand_country,
                open_to_relocation=query.open_to_relocation,
                remote_worldwide_accepted=query.remote_worldwide,
            )
            job.location_badge = parsed_loc.badge_label
            if parsed_loc.is_remote:
                job.remote = True

            if not parsed_loc.is_compatible:
                reason_key = (
                    "remote_region_restricted"
                    if (parsed_loc.incompatible_reason and "remote_region_restricted" in parsed_loc.incompatible_reason)
                    else "onsite_abroad"
                )
                filter_counts_total[reason_key] += 1
                per_source_breakdown.setdefault(src, dict(filter_counts_total))[reason_key] += 1
                continue

            # 3c. Excluded keywords (Hard filter with word boundaries)
            if query.excluded_keywords:
                title_desc = f"{job.title} {job.description}".lower()
                is_excluded = False
                for k in query.excluded_keywords:
                    k_clean = k.strip().lower()
                    if not k_clean:
                        continue
                    if re.search(r"\b" + re.escape(k_clean) + r"\b", title_desc):
                        is_excluded = True
                        break
                if is_excluded:
                    filter_counts_total["excluded_keywords"] += 1
                    per_source_breakdown.setdefault(src, dict(filter_counts_total))["excluded_keywords"] += 1
                    continue

            # 3d. Excluded companies (Hard filter)
            if query.excluded_companies:
                norm_c = normalize_company(job.company)
                is_excluded_comp = any(
                    normalize_company(c) == norm_c or normalize_company(c) in norm_c
                    for c in query.excluded_companies
                    if c.strip()
                )
                if is_excluded_comp:
                    filter_counts_total["excluded_keywords"] += 1
                    per_source_breakdown.setdefault(src, dict(filter_counts_total))["excluded_keywords"] += 1
                    continue

            # 3e. Explicit required filters (if marked required by user)
            if "employment_type" in required_fields and query.employment_types:
                text = f"{job.title} {job.description} {job.employment_type or ''}".lower()
                matched_emp = any(
                    et.lower() in text
                    for et in query.employment_types
                    if et.strip()
                )
                if not matched_emp:
                    filter_counts_total["employment_type"] += 1
                    per_source_breakdown.setdefault(src, dict(filter_counts_total))["employment_type"] += 1
                    continue

            if "experience_level" in required_fields and query.experience_levels:
                text = f"{job.title} {job.description} {job.seniority}".lower()
                matched_sen = any(
                    lvl.lower() in text
                    for lvl in query.experience_levels
                    if lvl.strip()
                )
                if not matched_sen:
                    filter_counts_total["experience_level"] += 1
                    per_source_breakdown.setdefault(src, dict(filter_counts_total))["experience_level"] += 1
                    continue

            filtered_jobs.append(job)

        # 3f. Role-family gate
        target_families = (
            set(query.role_families)
            if query.role_families
            else {FAMILY_SOFTWARE_WEB, FAMILY_DATA_AI, FAMILY_DEVOPS_CLOUD}
        )
        role_gate_relaxed = False
        final_jobs: list[JobPosting] = []

        if not query.also_show_other_roles:
            classified = [
                (j, classify_role_family(j.title, tags=None, description=j.description))
                for j in filtered_jobs
            ]
            in_target = [j for j, fam in classified if fam in target_families]

            if len(in_target) >= 10 or len(filtered_jobs) == 0:
                removed_by_family = len(filtered_jobs) - len(in_target)
                filter_counts_total["role_family"] += removed_by_family
                for j, fam in classified:
                    if fam not in target_families:
                        per_source_breakdown.setdefault(j.source, dict(filter_counts_total))["role_family"] += 1
                final_jobs = in_target
            else:
                # Relax to adjacent tech families (QA), but NEVER non-tech families
                adjacent_target = target_families | {FAMILY_QA}
                in_adjacent = [j for j, fam in classified if fam in adjacent_target]
                if len(in_adjacent) >= 10:
                    role_gate_relaxed = True
                    removed_by_family = len(filtered_jobs) - len(in_adjacent)
                    filter_counts_total["role_family"] += removed_by_family
                    for j, fam in classified:
                        if fam not in adjacent_target:
                            per_source_breakdown.setdefault(j.source, dict(filter_counts_total))["role_family"] += 1
                    final_jobs = in_adjacent
                else:
                    # Broaden to all tech families, but NEVER non-tech families
                    role_gate_relaxed = True
                    tech_only = [j for j, fam in classified if fam in TECH_FAMILIES]
                    removed_by_family = len(filtered_jobs) - len(tech_only)
                    filter_counts_total["role_family"] += removed_by_family
                    for j, fam in classified:
                        if fam not in TECH_FAMILIES:
                            per_source_breakdown.setdefault(j.source, dict(filter_counts_total))["role_family"] += 1
                    final_jobs = tech_only
        else:
            final_jobs = filtered_jobs

        # Count jobs that passed filters per source WITHOUT pre-scoring truncation
        source_after_local_counts: dict[str, int] = {}
        for j in final_jobs:
            source_after_local_counts[j.source] = source_after_local_counts.get(j.source, 0) + 1

        # Build SourceStatus objects
        for source in sources_to_run:
            name = source.name
            raw_cnt = len(source_raw_map.get(name, []))
            dedup_cnt = source_deduped_counts.get(name, 0)
            kept_cnt = source_after_local_counts.get(name, 0)

            # Ensure invariant: raw >= dedupe >= kept
            if dedup_cnt > raw_cnt:
                dedup_cnt = raw_cnt
            if kept_cnt > dedup_cnt:
                kept_cnt = dedup_cnt

            err = source_errors.get(name) or getattr(source, "last_error", None)
            http_st = getattr(source, "last_http_status", 200 if not err else None)
            query_sent = getattr(source, "last_query_sent", "")

            if err or (http_st and http_st >= 400):
                status_val = "error"
            elif raw_cnt == 0 and getattr(source, "last_error", None):
                status_val = "error"
            else:
                status_val = "ok"

            statuses.append(
                SourceStatus(
                    source=name,
                    status=status_val,
                    count=kept_cnt,
                    raw_fetched=raw_cnt,
                    after_dedupe=dedup_cnt,
                    after_local_filters=kept_cnt,
                    query_sent=query_sent,
                    http_status=http_st,
                    error=err,
                    duration_ms=source_durations.get(name, 0.0),
                    local_filters_applied=["hard_filters", "role_family"] if not role_gate_relaxed else ["hard_filters"],
                    filter_breakdown=per_source_breakdown.get(name, {}),
                )
            )

        # Determine primary filter reason if 0 jobs
        main_reason = None
        if len(final_jobs) == 0:
            active_filters_with_counts = [
                (k, v) for k, v in filter_counts_total.items() if v > 0
            ]
            if active_filters_with_counts:
                active_filters_with_counts.sort(key=lambda x: x[1], reverse=True)
                top_reasons = [f"{k} ({v} removed)" for k, v in active_filters_with_counts[:2]]
                main_reason = f"all jobs removed by: {' AND '.join(top_reasons)}"
            else:
                main_reason = "No candidate positions returned by active job board providers"

        # Construct SearchDiagnostics object
        total_raw = sum(len(postings) for postings in source_raw_map.values())
        total_after_dedupe = len(deduped_jobs)

        diagnostics = SearchDiagnostics(
            sources={
                st.source: {
                    "query_sent": st.query_sent,
                    "http_status": st.http_status,
                    "raw_fetched": st.raw_fetched,
                    "after_dedupe": st.after_dedupe,
                    "after_local_filters": st.after_local_filters,
                    "filter_breakdown": st.filter_breakdown,
                }
                for st in statuses
            },
            raw_fetched=total_raw,
            after_dedupe=total_after_dedupe,
            after_local_filters=len(final_jobs),
            preselected=len(final_jobs),
            candidate_cap=None,
            truncated_by=None,
            after_hard_filters=len(final_jobs),
            ranked=len(final_jobs),
            main_filter_removed=main_reason,
            filter_breakdown=filter_counts_total,
            fallback_used=role_gate_relaxed,
            fallback_stage="role_family_relaxed" if role_gate_relaxed else "strict",
        )

        sources_responded = sum(1 for s in statuses if s.status == "ok")

        return SearchJobsResult(
            jobs=final_jobs,
            total=len(final_jobs),
            sources_responded=sources_responded,
            sources_total=len(statuses),
            source_statuses=statuses,
            diagnostics=diagnostics,
        )
