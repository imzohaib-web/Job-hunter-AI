from __future__ import annotations

import logging
import time

from app.embeddings import model as embeddings_model
from app.embeddings.model import (
    async_batch_encode,
    batch_encode,
    cosine_similarity,
)
from app.llm.client import LLMClient
from app.llm.security import wrap_untrusted
from app.schemas.job import JobPosting
from app.schemas.match import (
    CandidatePreferences,
    JobWithEmbedding,
    MatchResult,
    MatchScoreBreakdown,
    RankedJobItem,
    RankingWeights,
    RankResponseData,
)
from app.schemas.profile import ParsedProfile
from app.services.job_sources.role_family import (
    FAMILY_ADJACENT_TECH,
    FAMILY_DATA_AI,
    FAMILY_DEVOPS_CLOUD,
    FAMILY_QA,
    FAMILY_SOFTWARE_WEB,
    classify_role_family,
)
from app.services.ranking.bm25_scorer import compute_bm25_scores
from app.services.ranking.hard_filters import (
    calculate_candidate_years_experience,
    evaluate_hard_filters,
    evaluate_soft_preferences,
    extract_job_required_years,
)
from app.services.ranking.preselector import FastJobPreselector
from app.services.ranking.prompts import RERANK_SYSTEM_PROMPT, RERANK_USER_TEMPLATE
from app.services.ranking.schemas import RerankBatchOutput
from app.services.ranking.skill_scorer import (
    collect_candidate_skills,
    evaluate_skill_overlap,
)

logger = logging.getLogger("jobpilot.ranking")


def assign_tier(overall_score: float, is_stretch_override: bool = False) -> str:
    """Assign score tier based on overall percentage score and stretch overrides:
    - strong: >= 70%
    - good: 50% - 69.9%
    - possible: 30% - 49.9%
    - stretch: < 30% or hard-filter/senior/region-restricted override
    """
    if is_stretch_override or overall_score < 30.0:
        return "stretch"
    if overall_score >= 70.0:
        return "strong"
    if overall_score >= 50.0:
        return "good"
    return "possible"


def build_profile_text(profile: ParsedProfile) -> str:
    """Format rich text representation of candidate profile for ranking."""
    parts: list[str] = []
    if profile.name:
        parts.append(f"Candidate: {profile.name}")
    if profile.summary:
        parts.append(f"Summary: {profile.summary}")

    skill_names = [s.name for s in profile.skills]
    if skill_names:
        parts.append(f"Key Skills: {', '.join(skill_names)}")

    for exp in profile.experience[:5]:
        bullets = " ".join(exp.bullets[:2]) if exp.bullets else ""
        tech = f" (Tech: {', '.join(exp.technologies)})" if exp.technologies else ""
        parts.append(f"Experience: {exp.title} at {exp.company}. {bullets}{tech}")

    for proj in profile.projects[:3]:
        tech = f" (Tech: {', '.join(proj.technologies)})" if proj.technologies else ""
        parts.append(f"Project: {proj.name} - {proj.description}{tech}")

    return "\n".join(parts)


def build_job_text(job: JobPosting) -> str:
    """Format lightweight text representation: title + top skills + first 800 chars of description."""
    parts: list[str] = [job.title]
    if job.skills_required:
        parts.append(f"Skills: {', '.join(job.skills_required[:8])}")
    if job.description:
        parts.append(job.description[:800])
    return "\n".join(parts)


def _compute_experience_score(profile: ParsedProfile, job: JobPosting) -> float:
    cand_years = calculate_candidate_years_experience(profile)
    job_years = extract_job_required_years(job)
    if cand_years >= job_years:
        return 100.0
    gap = job_years - cand_years
    return max(20.0, 100.0 - (gap * 18.0))


def _compute_location_score(job: JobPosting, prefs: CandidatePreferences) -> float:
    is_remote = (
        job.remote is True or "remote" in job.location.lower() or "remote" in job.title.lower()
    )
    job_loc_lower = job.location.lower()
    job_desc_lower = job.description.lower()

    has_country_restriction = any(
        r in job_loc_lower or r in job_desc_lower
        for r in (
            "us only",
            "usa only",
            "uk only",
            "canada only",
            "must be located in",
            "us citizen",
            "security clearance",
        )
    )

    if prefs.remote_only:
        if not is_remote:
            return 25.0
        if has_country_restriction:
            return 80.0
        return 100.0

    if prefs.location and prefs.location.lower() in job_loc_lower:
        return 100.0

    if is_remote:
        if has_country_restriction:
            return 82.0
        return 95.0

    return 65.0


def _build_deterministic_explanation(
    job: JobPosting,
    matched_skills: list[str],
    missing_skills: list[str],
    soft_reasons: list[str],
    hard_filter_failed: bool,
    hard_filter_reason: str | None,
) -> str:
    if hard_filter_failed and hard_filter_reason:
        return f"Criteria not met: {hard_filter_reason}"[:400]

    parts: list[str] = []
    if matched_skills:
        parts.append(f"Matches: {', '.join(matched_skills[:4])}.")
    if missing_skills:
        parts.append(f"Missing: {', '.join(missing_skills[:3])}.")
    if not matched_skills and not missing_skills:
        parts.append("No skill overlap found.")

    base_text = " ".join(parts)
    if soft_reasons:
        base_text = f"{base_text} ({'; '.join(soft_reasons)})"
    return base_text[:400]


class HybridRankingAgent:
    """Multi-stage hybrid ranking agent combining hard filters, soft preferences,

    dense vector similarity, BM25 keyword matching, skill overlap, and adaptive fallback.
    """

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self._llm_client = llm_client or LLMClient()

    async def rank_jobs(
        self,
        profile: ParsedProfile,
        jobs: list[JobWithEmbedding],
        preferences: CandidatePreferences | None = None,
        weights: RankingWeights | None = None,
        llm_rerank: bool = True,
    ) -> RankResponseData:
        t_start = time.perf_counter()
        prefs = preferences or CandidatePreferences()
        w = weights or RankingWeights()

        # STEP 2 & 5: Fast Deterministic Pre-Selection of Candidate Postings (top 100)
        t_preselect_start = time.perf_counter()
        preselector = FastJobPreselector(target_count=100, max_source_ratio=0.6)
        cand_postings = [j.job for j in jobs]
        target_titles_list = getattr(prefs, "target_titles", []) or []
        preselected_postings = preselector.preselect(
            cand_postings,
            profile,
            target_titles=target_titles_list,
        )
        selected_ext_ids = {j.external_id for j in preselected_postings}
        eval_jobs = [j for j in jobs if j.job.external_id in selected_ext_ids]
        if not eval_jobs:
            eval_jobs = list(jobs[:100])
        t_preselect = time.perf_counter() - t_preselect_start

        # Stage 6: Embedding Cache & Batch Generation (Only for preselected jobs, non-blocking)
        t_embed_start = time.perf_counter()
        profile_text = build_profile_text(profile)
        job_texts = [build_job_text(j.job) for j in eval_jobs]
        candidate_skills = collect_candidate_skills(profile)

        cached_embeddings: list[list[float] | None] = [
            j.embedding if (j.embedding and len(j.embedding) == 384) else None
            for j in eval_jobs
        ]
        missing_indices = [i for i, emb in enumerate(cached_embeddings) if emb is None]
        new_embeddings_count = len(missing_indices)

        if missing_indices:
            missing_texts = [job_texts[i] for i in missing_indices]
            computed_vectors = await embeddings_model.async_batch_encode(missing_texts, batch_size=32)
            for idx, vec in zip(missing_indices, computed_vectors, strict=True):
                cached_embeddings[idx] = vec

        profile_embedding = (await embeddings_model.async_batch_encode([profile_text], batch_size=32))[0]
        t_embed = time.perf_counter() - t_embed_start

        # Stage 2: Retrieval Scores (BM25 + Semantic Cosine Similarity)
        t_rank_start = time.perf_counter()
        bm25_scores = compute_bm25_scores(profile_text, job_texts)
        semantic_scores: list[float] = []
        for emb in cached_embeddings:
            if emb is not None:
                sim = cosine_similarity(profile_embedding, emb)
                semantic_scores.append(round(min(100.0, max(0.0, (sim + 1.0) / 2.0 * 100.0)), 2))
            else:
                semantic_scores.append(50.0)

        # Stage 1, 3, 4: Hard Filters, Soft Preferences, Skills, and Combined Score
        passing_items: list[RankedJobItem] = []
        failed_items: list[RankedJobItem] = []

        for i, item in enumerate(eval_jobs):
            job = item.job
            final_emb = cached_embeddings[i]

            # Stage 1: Hard filter evaluation
            failed, reason = evaluate_hard_filters(job, profile, prefs)

            # Stage 3: Skill overlap
            skill_eval = evaluate_skill_overlap(job, candidate_skills)

            # Soft preference evaluation (penalties and bonuses with explicit reasons)
            soft_penalty, soft_reasons = evaluate_soft_preferences(job, profile, prefs)

            # Stage 4: Sub-scores & Weighted combination
            semantic_val = semantic_scores[i]
            keyword_val = bm25_scores[i]
            skill_val = skill_eval.score
            exp_val = _compute_experience_score(profile, job)
            loc_val = _compute_location_score(job, prefs)

            breakdown = MatchScoreBreakdown(
                semantic=semantic_val,
                keyword=keyword_val,
                skills=skill_val,
                experience=round(exp_val, 2),
                location=round(loc_val, 2),
            )

            raw_combined = (
                semantic_val * w.semantic
                + keyword_val * w.keyword
                + skill_val * w.skills
                + exp_val * w.experience
            )

            if failed:
                overall_score = min(15, int(raw_combined * 0.2))
                explanation = f"Hard filter criteria not met: {reason}"[:400]
            else:
                adjusted_score = max(0.0, min(100.0, float(raw_combined + soft_penalty)))

                # STEP 4: Hard Score Caps
                title_lower = job.title.lower()
                is_title_match = any(
                    k in title_lower
                    for k in [
                        "developer", "engineer", "programmer", "software",
                        "full stack", "frontend", "backend", "react", "node", "python",
                        "ml", "ai", "data", "cloud",
                    ]
                )
                matched_count = len(skill_eval.matched_skills)
                job_family = classify_role_family(job.title, description=job.description)
                is_family_match = job_family in {FAMILY_SOFTWARE_WEB, FAMILY_DATA_AI, FAMILY_DEVOPS_CLOUD, FAMILY_QA}
                is_adjacent_family = (job_family == FAMILY_ADJACENT_TECH) or ("solutions architect" in title_lower)

                if is_adjacent_family:
                    adjusted_score = min(35.0, adjusted_score)
                elif not is_family_match:
                    adjusted_score = min(15.0, adjusted_score)
                elif matched_count == 0:
                    adjusted_score = min(25.0, adjusted_score)
                elif matched_count < 2 and not is_title_match:
                    adjusted_score = min(45.0, adjusted_score)

                # Exceeding 70 requires title match AND 3+ matched skills
                if adjusted_score > 70.0 and not (is_title_match and matched_count >= 3):
                    adjusted_score = 70.0

                overall_score = int(round(adjusted_score))
                explanation = _build_deterministic_explanation(
                    job,
                    skill_eval.matched_skills,
                    skill_eval.missing_skills,
                    soft_reasons,
                    False,
                    None,
                )

            is_senior_above_level = any("above your level" in r.lower() for r in soft_reasons)
            is_region_restricted = any("restricted to" in r.lower() for r in soft_reasons)
            tier = assign_tier(
                overall_score,
                is_stretch_override=bool(failed or is_senior_above_level or is_region_restricted),
            )

            match_res = MatchResult(
                job_id=job.external_id,
                overall_score=overall_score,
                breakdown=breakdown,
                matched_skills=skill_eval.matched_skills,
                missing_skills=skill_eval.missing_skills,
                explanation=explanation,
                hard_filter_failed=failed,
                hard_filter_reason=reason,
                fallback_stage="strict",
                tier=tier,
            )

            ranked_item = RankedJobItem(
                job=job,
                match=match_res,
                embedding=final_emb,
                fallback_stage="strict",
            )

            if failed:
                failed_items.append(ranked_item)
            else:
                passing_items.append(ranked_item)

        # Sort passing candidates: strong/good/possible first, stretch last, descending by score
        def _tier_sort_key(item: RankedJobItem) -> tuple[int, int]:
            tier_order = {"strong": 0, "good": 1, "possible": 2, "stretch": 3}
            t_rank = tier_order.get(item.match.tier, 2)
            return (t_rank, -item.match.overall_score)

        passing_items.sort(key=_tier_sort_key)
        t_rank = time.perf_counter() - t_rank_start

        # Adaptive fallback: do not pad with senior roles
        fallback_used = False
        fallback_stage = "strict"

        # Stage 5: LLM Reranking of Top 15 Passing Candidates
        top_candidates = passing_items[:15]
        remaining_passing = passing_items[15:]

        t_rerank_start = time.perf_counter()
        if llm_rerank and top_candidates:
            await self._apply_llm_rerank(profile, top_candidates)
            top_candidates.sort(key=lambda x: x.match.overall_score, reverse=True)
        t_rerank = time.perf_counter() - t_rerank_start

        all_ranked = top_candidates + remaining_passing + failed_items
        t_total = time.perf_counter() - t_start

        timings = {
            "preselect_s": round(t_preselect, 4),
            "embed_s": round(t_embed, 4),
            "rank_s": round(t_rank, 4),
            "rerank_s": round(t_rerank, 4),
            "total_s": round(t_total, 4),
        }

        return RankResponseData(
            ranked_jobs=all_ranked,
            total=len(all_ranked),
            unfiltered_count=len(passing_items),
            hard_filtered_count=len(failed_items),
            new_embeddings_generated=new_embeddings_count,
            fallback_used=fallback_used,
            fallback_stage=fallback_stage,
            preselected_count=len(eval_jobs),
            timings=timings,
        )

    async def _apply_llm_rerank(
        self,
        profile: ParsedProfile,
        candidates: list[RankedJobItem],
    ) -> None:
        """Invoke LLM structured rerank on the top 15 candidates."""
        profile_summary = (
            f"Name: {profile.name}\n"
            f"Summary: {profile.summary}\n"
            f"Skills: {', '.join(s.name for s in profile.skills[:12])}"
        )

        job_summaries: list[str] = []
        for c in candidates:
            j = c.job
            m = c.match
            job_summaries.append(
                f"Job ID: {j.external_id}\n"
                f"Title: {j.title} at {j.company}\n"
                f"Location: {j.location} (Remote: {j.remote})\n"
                f"Matched Skills: {', '.join(m.matched_skills[:6])}\n"
                f"Missing Skills: {', '.join(m.missing_skills[:4])}\n"
                f"Current Score: {m.overall_score}\n"
                f"Description: {j.description[:800]}\n---"
            )

        variables = {
            "candidate_profile_data": wrap_untrusted("candidate_profile", profile_summary),
            "jobs_data": wrap_untrusted("jobs_to_rerank", "\n\n".join(job_summaries)),
        }

        try:
            result = await self._llm_client.generate_structured(
                prompt_template=f"{RERANK_SYSTEM_PROMPT}\n\n{RERANK_USER_TEMPLATE}",
                variables=variables,
                output_model=RerankBatchOutput,
                temperature=0.1,
                task_name="hybrid_rerank_agent",
            )

            eval_by_id = {item.job_id: item for item in result.evaluations}
            for candidate in candidates:
                eval_item = eval_by_id.get(candidate.match.job_id)
                if eval_item:
                    clamped_adj = max(-8, min(8, eval_item.score_adjustment))
                    new_score = max(0, min(100, candidate.match.overall_score + clamped_adj))

                    candidate.match.overall_score = new_score
                    candidate.match.score_adjustment = clamped_adj
                    candidate.match.adjustment_reason = eval_item.adjustment_reason
                    candidate.match.explanation = eval_item.explanation[:400]
                    candidate.match.strengths = eval_item.strengths
                    candidate.match.gaps = eval_item.gaps
                    candidate.match.suggestion = eval_item.suggestion

        except Exception as exc:
            logger.warning("LLM reranking failed or timed out (%s); keeping base scores.", exc)
            for c in candidates:
                c.match.suggestion = "Highlight matching skills in your application."
