from __future__ import annotations

import logging
import time
from typing import Any

from app.core.config import get_settings
from app.schemas.job import JobPosting, JobQuery, SearchJobsResult
from app.schemas.match import CandidatePreferences, JobWithEmbedding, RankResponseData
from app.schemas.profile import ParsedProfile
from app.services.job_sources.aggregator import JobSourceAggregator
from app.services.ranking.agent import HybridRankingAgent

logger = logging.getLogger("jobpilot.discovery_pipeline")


async def run_discovery(
    profile: ParsedProfile,
    preferences: CandidatePreferences | None = None,
    query: JobQuery | None = None,
    sources: list[str] | None = None,
    llm_rerank: bool = False,
) -> dict[str, Any]:
    """Single unified production discovery and ranking pipeline.

    Guarantees:
    - Same pipeline logic for scripts, BullMQ worker, and REST API.
    - Scores computed exactly once in AI service.
    - Embeddings generated for preselected candidates.
    - Accurate invariant audit and diagnostics.
    """
    t0 = time.perf_counter()
    settings = get_settings()
    prefs = preferences or CandidatePreferences()

    # 1. Build unified JobQuery
    keywords = ""
    if query and query.keywords:
        keywords = query.keywords
    elif prefs.target_titles:
        keywords = prefs.target_titles[0]
    elif profile.experience and profile.experience[0].title:
        keywords = profile.experience[0].title
    else:
        keywords = "Software Engineer"

    target_titles = list(query.target_titles if (query and query.target_titles) else prefs.target_titles)
    emp_types = list(query.employment_types if (query and query.employment_types) else prefs.employment_types)
    exp_levels = list(query.experience_levels if (query and query.experience_levels) else prefs.experience_levels)
    work_modes = list(query.work_modes if (query and query.work_modes) else prefs.work_modes)

    effective_sources = sources
    if not effective_sources and query and query.sources:
        effective_sources = query.sources

    job_query = JobQuery(
        keywords=keywords,
        target_titles=target_titles,
        employment_types=emp_types,
        experience_levels=exp_levels,
        work_modes=work_modes,
        locations=query.locations if query else [],
        open_to_relocation=query.open_to_relocation if query else getattr(prefs, "open_to_relocation", False),
        remote_worldwide=query.remote_worldwide if query else getattr(prefs, "remote_worldwide", True),
        visa_sponsorship_needed=query.visa_sponsorship_needed if query else getattr(prefs, "visaSponsorshipNeeded", False),
        salary_currency=query.salary_currency if query else getattr(prefs, "salary_currency", "USD"),
        salary_min=query.salary_min if query else prefs.salary_min,
        salary_period=query.salary_period if query else "yearly",
        hide_without_salary=query.hide_without_salary if query else False,
        must_have_skills=query.must_have_skills if query else [],
        nice_to_have_skills=query.nice_to_have_skills if query else [],
        industries=query.industries if query else [],
        company_sizes=query.company_sizes if query else [],
        date_posted=query.date_posted if query else "all",
        excluded_keywords=query.excluded_keywords if query else prefs.excluded_keywords,
        excluded_companies=query.excluded_companies if query else prefs.excluded_companies,
        role_families=query.role_families if query else [],
        also_show_other_roles=query.also_show_other_roles if query else False,
        location=query.location if query else prefs.location,
        remote_only=query.remote_only if query else prefs.remote_only,
        seniority=query.seniority if query else (exp_levels[0] if exp_levels else "mid"),
        sources=effective_sources or [],
    )

    # 2. Fetch, Deduplicate, and Filter Jobs
    t_fetch_start = time.perf_counter()
    aggregator = JobSourceAggregator(settings=settings)
    search_result = await aggregator.aggregate(job_query)
    t_fetch_duration = time.perf_counter() - t_fetch_start

    # 3. Hybrid Ranking with Fast Pre-Selection & Embeddings
    jobs_with_emb = [JobWithEmbedding(job=j, embedding=None) for j in search_result.jobs]
    ranking_agent = HybridRankingAgent()

    t_rank_start = time.perf_counter()
    rank_response = await ranking_agent.rank_jobs(
        profile=profile,
        jobs=jobs_with_emb,
        preferences=prefs,
        llm_rerank=llm_rerank,
    )
    t_rank_duration = time.perf_counter() - t_rank_start
    t_total_duration = time.perf_counter() - t0

    # 4. Score Tiers Aggregation
    tier_counts: dict[str, int] = {"strong": 0, "good": 0, "possible": 0, "stretch": 0}
    for item in rank_response.ranked_jobs:
        tier = item.match.tier or "possible"
        tier_counts[tier] = tier_counts.get(tier, 0) + 1

    # 5. Telemetry & Timings
    timings = {
        "fetch_s": round(t_fetch_duration, 4),
        "rank_total_s": round(t_rank_duration, 4),
        "total_s": round(t_total_duration, 4),
        **(rank_response.timings or {}),
    }

    diag = search_result.diagnostics
    diag_dict: dict[str, Any] = {}
    if diag:
        diag_dict = diag.model_dump()
        diag_dict["preselected"] = rank_response.preselected_count or len(rank_response.ranked_jobs)
        diag_dict["ranked"] = rank_response.unfiltered_count
        diag_dict["timings"] = timings

    return {
        "ranked_jobs": rank_response.ranked_jobs,
        "total": rank_response.total,
        "unfiltered_count": rank_response.unfiltered_count,
        "hard_filtered_count": rank_response.hard_filtered_count,
        "source_statuses": search_result.source_statuses,
        "diagnostics": diag_dict,
        "tier_counts": tier_counts,
        "timings": timings,
        "fallback_used": rank_response.fallback_used,
        "fallback_stage": rank_response.fallback_stage,
    }
