#!/usr/bin/env python3
"""Execute the unified discovery & ranking pipeline for candidate verified profile and print diagnostics.

Uses the exact same production path (app.services.discovery_pipeline.run_discovery)
as the BullMQ worker and REST API endpoints.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Unbuffered output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(line_buffering=True)

if "tensorflow" not in sys.modules:
    sys.modules["tensorflow"] = None
if "pyarrow" not in sys.modules:
    sys.modules["pyarrow"] = None

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

REPO_ROOT = Path(__file__).resolve().parent.parent
AI_SERVICE_DIR = REPO_ROOT / "apps" / "ai-service"
sys.path.insert(0, str(AI_SERVICE_DIR))

from app.core.config import get_settings
from app.schemas.job import JobQuery
from app.schemas.match import CandidatePreferences
from app.schemas.profile import ParsedProfile
from app.services.discovery_pipeline import run_discovery


def load_candidate_profile_and_query() -> tuple[ParsedProfile, JobQuery, CandidatePreferences]:
    dump_path = REPO_ROOT / "scripts" / "candidate_profile_dump.json"
    if not dump_path.exists():
        raise FileNotFoundError(f"Missing {dump_path}")

    with open(dump_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    profile_dict = data.get("verifiedProfile", {})
    last_query = data.get("lastSearchQuery", {})
    prefs_dict = last_query.get("preferences", {})

    profile = ParsedProfile.model_validate(profile_dict)

    query = JobQuery(
        keywords=last_query.get("keywords") or "MERN Stack Developer Intern",
        target_titles=prefs_dict.get("targetTitles") or ["MERN Stack Developer Intern", "Front-End Developer", "Backend Engineer"],
        employment_types=prefs_dict.get("employmentTypes") or ["full-time"],
        experience_levels=prefs_dict.get("experienceLevels") or ["internship", "entry"],
        work_modes=prefs_dict.get("workModes") or ["remote", "hybrid"],
        locations=prefs_dict.get("locations") or [{"city": "Wah Cantt, Punjab, Pakistan", "country": "Pakistan"}],
        open_to_relocation=prefs_dict.get("openToRelocation", False),
        remote_worldwide=prefs_dict.get("remoteWorldwide", True),
        visa_sponsorship_needed=prefs_dict.get("visaSponsorshipNeeded", False),
        salary_currency=prefs_dict.get("salary", {}).get("currency", "USD"),
        salary_min=prefs_dict.get("salary", {}).get("minimum", 1000),
        salary_period=prefs_dict.get("salary", {}).get("period", "yearly"),
        hide_without_salary=prefs_dict.get("salary", {}).get("hideWithoutSalary", False),
        must_have_skills=prefs_dict.get("mustHaveSkills") or ["Python", "JavaScript", "TypeScript", "Java"],
        nice_to_have_skills=prefs_dict.get("niceToHaveSkills") or [],
        industries=prefs_dict.get("industries") or [],
        company_sizes=prefs_dict.get("companySizes") or [],
        date_posted=prefs_dict.get("datePosted") or "all",
        excluded_keywords=prefs_dict.get("excludedKeywords") or [],
        excluded_companies=prefs_dict.get("excludedCompanies") or [],
        role_families=prefs_dict.get("roleFamilies") or ["software"],
        also_show_other_roles=prefs_dict.get("alsoShowOtherRoles", True),
        location=last_query.get("location") or "Wah Cantt, Punjab, Pakistan",
        remote_only=last_query.get("remoteOnly", True),
        seniority=last_query.get("seniority") or "internship",
        sources=["remotive", "arbeitnow", "greenhouse", "lever", "remoteok", "jobicy", "himalayas", "weworkremotely", "jsearch", "adzuna"],
        limit=50,
    )

    candidate_prefs = CandidatePreferences(
        target_titles=query.target_titles,
        location=query.location,
        remote_only=query.remote_only,
        remote_worldwide=query.remote_worldwide,
        excluded_companies=query.excluded_companies,
        excluded_keywords=query.excluded_keywords,
        employment_types=query.employment_types,
        experience_levels=query.experience_levels,
        work_modes=query.work_modes,
        salary_min=query.salary_min,
        required_fields=[],
    )

    return profile, query, candidate_prefs


async def main():
    profile, query, candidate_prefs = load_candidate_profile_and_query()

    print("=" * 80)
    print("UNIFIED JOB DISCOVERY & RANKING PIPELINE DIAGNOSTIC RUN")
    print(f"Candidate: {profile.name} | Location: {profile.location}")
    print(f"Keywords: {query.keywords}")
    print(f"Target Titles: {query.target_titles}")
    print(f"Remote Worldwide Accepted: {query.remote_worldwide} | Open to Relocation: {query.open_to_relocation}")
    print(f"Soft Preferences: emp_types={query.employment_types}, exp_levels={query.experience_levels}, min_salary={query.salary_min}")
    print("=" * 80)

    # Call the exact same production discovery pipeline
    result = await run_discovery(
        profile=profile,
        preferences=candidate_prefs,
        query=query,
        sources=query.sources,
        llm_rerank=False,
    )

    print("\n[STEP 1 & 2: SOURCE FETCH & NORMALIZATION DIAGNOSTICS]")
    print(f"{'Source':<15} | {'HTTP Status':<12} | {'Raw Fetched':<12} | {'Kept (M)':<10} | {'Info'}")
    print("-" * 80)
    for st in result["source_statuses"]:
        status_disp = f"HTTP {st.http_status}" if st.http_status else st.status.upper()
        if st.status == "skipped":
            status_disp = "SKIPPED"
        info = st.query_sent or st.error or st.reason or ""
        print(f"{st.source:<15} | {status_disp:<12} | {st.raw_fetched:>11} | {st.count:>10} | {info[:35]}")

    diag = result.get("diagnostics", {})
    if diag:
        print("\n[DISCOVERY STAGE COUNTS (FUNNEL INVARIANT AUDIT)]")
        print(f"  Stage 1 (Raw Fetched)         : {diag.get('raw_fetched', 0)}")
        print(f"  Stage 2 (After Deduplication) : {diag.get('after_dedupe', 0)}")
        print(f"  Stage 3 (After Local Filters) : {diag.get('after_local_filters', 0)}")
        print(f"  Stage 4 (Preselected Top)     : {diag.get('preselected', 0)}")
        print(f"  Stage 5 (Ranked Candidates)   : {diag.get('ranked', 0)}")
        print(f"  Role Gate Relaxed?            : {diag.get('fallback_used', False)} (stage: {diag.get('fallback_stage', 'none')})")

        print("\n[PER-FILTER BREAKDOWN (Jobs Removed)]")
        for f_name, count in (diag.get("filter_breakdown") or {}).items():
            print(f"  {f_name:<26}: {count:>5} removed")

    timings = result.get("timings", {})
    print(f"\n[PER-STAGE TIMINGS]")
    print(f"  Fetch & Local Filter Duration : {timings.get('fetch_s', 0):.2f}s")
    print(f"  Fast Pre-Selection Duration   : {timings.get('preselect_s', 0):.4f}s")
    print(f"  Embedding Duration            : {timings.get('embedding_s', 0):.2f}s")
    print(f"  Hybrid Scoring Duration       : {timings.get('scoring_s', 0):.4f}s")
    print(f"  Total Rank Duration           : {timings.get('rank_total_s', 0):.2f}s")
    print(f"  TOTAL SEARCH & RANK DURATION  : {timings.get('total_s', 0):.2f}s")

    tier_counts = result.get("tier_counts", {})
    print(f"\n[SCORE TIERS]")
    print(f"  Strong (>=70) : {tier_counts.get('strong', 0)}")
    print(f"  Good (50-69)  : {tier_counts.get('good', 0)}")
    print(f"  Possible(30-49): {tier_counts.get('possible', 0)}")
    print(f"  Stretch (<30) : {tier_counts.get('stretch', 0)}")

    ranked_jobs = result.get("ranked_jobs", [])
    print(f"\n[TOP 15 RANKED JOBS (Total: {len(ranked_jobs)})]")
    print("-" * 100)
    for idx, item in enumerate(ranked_jobs[:15], 1):
        job = item.job
        match = item.match
        matched = ", ".join(match.matched_skills[:4]) if match.matched_skills else "none"
        missing = ", ".join(match.missing_skills[:3]) if match.missing_skills else "none"
        badge = job.location_badge or ("Remote" if job.remote else "Onsite")
        print(
            f"#{idx:<2} | {match.overall_score:>4.1f}% [{match.tier.upper():<7}] | {job.title[:38]:<38} | {job.company[:16]:<16} | {badge[:20]}"
        )
        print(f"     Matched: {matched} | Missing: {missing}")
        if match.explanation:
            print(f"     Reason : {match.explanation[:90]}")
        print("-" * 100)

    print("\n" + "=" * 80)
    print("RUNNING IMMEDIATE SECOND RUN OF run_discovery TO REPRODUCE BUG B")
    print("=" * 80)
    try:
        t_second_start = time.perf_counter()
        second_result = await run_discovery(
            profile=profile,
            preferences=candidate_prefs,
            query=query,
            sources=query.sources,
            llm_rerank=False,
        )
        print(f"Second run SUCCESS in {time.perf_counter() - t_second_start:.2f}s!")
        print(f"Second run data: {second_result.get('data', {}).keys()}")
        print(f"Second run diagnostics: {second_result.get('data', {}).get('diagnostics')}")
        print(f"Second run ranked jobs count: {len(second_result.get('data', {}).get('ranked_jobs', []))}")
    except Exception as exc:
        print("SECOND RUN FAILED WITH EXCEPTION:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
