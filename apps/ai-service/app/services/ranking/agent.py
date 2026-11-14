from __future__ import annotations

import logging

from app.embeddings.model import batch_encode, cosine_similarity
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
from app.services.ranking.bm25_scorer import compute_bm25_scores
from app.services.ranking.hard_filters import (
    calculate_candidate_years_experience,
    evaluate_hard_filters,
    extract_job_required_years,
)
from app.services.ranking.prompts import RERANK_SYSTEM_PROMPT, RERANK_USER_TEMPLATE
from app.services.ranking.schemas import RerankBatchOutput
from app.services.ranking.skill_scorer import (
    collect_candidate_skills,
    evaluate_skill_overlap,
)

logger = logging.getLogger("jobpilot.ranking")


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
    """Format rich text representation of job posting for ranking."""
    parts: list[str] = [
        f"Title: {job.title}",
        f"Company: {job.company}",
        f"Location: {job.location}",
        f"Seniority: {job.seniority}",
    ]
    if job.skills_required:
        parts.append(f"Required Skills: {', '.join(job.skills_required)}")
    if job.description:
        # Cap description snippet for embedding and BM25 indexing
        parts.append(f"Description: {job.description[:2500]}")
    return "\n".join(parts)


def _compute_experience_score(profile: ParsedProfile, job: JobPosting) -> float:
    cand_years = calculate_candidate_years_experience(profile)
    job_years = extract_job_required_years(job)
    if cand_years >= job_years:
        return 100.0
    gap = job_years - cand_years
    # Proportional penalty for gap within tolerance
    return max(20.0, 100.0 - (gap * 18.0))


def _compute_location_score(job: JobPosting, prefs: CandidatePreferences) -> float:
    is_remote = (
        job.remote is True or "remote" in job.location.lower() or "remote" in job.title.lower()
    )
    if prefs.remote_only:
        return 100.0 if is_remote else 30.0
    if prefs.location and prefs.location.lower() in job.location.lower():
        return 100.0
    if is_remote:
        return 95.0
    return 70.0


def _build_fallback_explanation(
    job: JobPosting,
    matched_skills: list[str],
    missing_skills: list[str],
    hard_filter_failed: bool,
    hard_filter_reason: str | None,
) -> str:
    if hard_filter_failed and hard_filter_reason:
        return f"Criteria not met: {hard_filter_reason}"[:400]

    matched_str = ", ".join(matched_skills[:3]) if matched_skills else "general engineering"
    missing_str = f" Lacks {', '.join(missing_skills[:2])}." if missing_skills else ""
    text = f"Solid fit for {job.title} based on {matched_str}.{missing_str}"
    return text[:400]


class HybridRankingAgent:
    """Multi-stage hybrid ranking agent combining hard filters, dense vector similarity,

    BM25 keyword matching, skill overlap, and LLM top-15 reranking.
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
        prefs = preferences or CandidatePreferences()
        w = weights or RankingWeights()

        profile_text = build_profile_text(profile)
        job_texts = [build_job_text(j.job) for j in jobs]
        candidate_skills = collect_candidate_skills(profile)

        # Stage 6: Embedding Cache & Batch Generation
        cached_embeddings: list[list[float] | None] = [j.embedding for j in jobs]
        missing_indices = [i for i, emb in enumerate(cached_embeddings) if emb is None]
        new_embeddings_count = len(missing_indices)

        if missing_indices:
            missing_texts = [job_texts[i] for i in missing_indices]
            computed_vectors = batch_encode(missing_texts)
            for idx, vec in zip(missing_indices, computed_vectors, strict=True):
                cached_embeddings[idx] = vec

        # Compute profile embedding once
        profile_embedding = batch_encode([profile_text])[0]

        # Stage 2: Retrieval Scores (BM25 + Semantic Cosine Similarity)
        bm25_scores = compute_bm25_scores(profile_text, job_texts)
        semantic_scores: list[float] = []
        for emb in cached_embeddings:
            if emb is not None:
                sim = cosine_similarity(profile_embedding, emb)
                # Map -1..1 to 0..100
                semantic_scores.append(round(min(100.0, max(0.0, (sim + 1.0) / 2.0 * 100.0)), 2))
            else:
                semantic_scores.append(50.0)

        # Stage 1, 3, 4: Hard Filters, Skills, Experience, and Combined Score
        passing_items: list[RankedJobItem] = []
        failed_items: list[RankedJobItem] = []

        for i, item in enumerate(jobs):
            job = item.job
            final_emb = cached_embeddings[i]

            # Stage 1: Hard filter evaluation
            failed, reason = evaluate_hard_filters(job, profile, prefs)

            # Stage 3: Skill overlap
            skill_eval = evaluate_skill_overlap(job, candidate_skills)

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
                # Failed hard filters stay in output with low score
                overall_score = min(15, int(raw_combined * 0.2))
                explanation = f"Hard filter criteria not met: {reason}"[:400]
            else:
                overall_score = int(min(100.0, max(0.0, round(raw_combined))))
                explanation = _build_fallback_explanation(
                    job, skill_eval.matched_skills, skill_eval.missing_skills, False, None
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
            )

            ranked_item = RankedJobItem(
                job=job,
                match=match_res,
                embedding=final_emb,
            )

            if failed:
                failed_items.append(ranked_item)
            else:
                passing_items.append(ranked_item)

        # Sort passing candidates by overall_score descending
        passing_items.sort(key=lambda x: x.match.overall_score, reverse=True)

        # Stage 5: LLM Reranking of Top 15 Passing Candidates
        top_candidates = passing_items[:15]
        remaining_passing = passing_items[15:]

        if llm_rerank and top_candidates:
            await self._apply_llm_rerank(profile, top_candidates)
            # Re-sort top candidates after score adjustment
            top_candidates.sort(key=lambda x: x.match.overall_score, reverse=True)

        all_ranked = top_candidates + remaining_passing + failed_items

        return RankResponseData(
            ranked_jobs=all_ranked,
            total=len(all_ranked),
            unfiltered_count=len(passing_items),
            hard_filtered_count=len(failed_items),
            new_embeddings_generated=new_embeddings_count,
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

            # Apply bounded score adjustments [-8, +8] and explanations
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
