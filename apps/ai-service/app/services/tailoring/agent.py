from __future__ import annotations

import logging
from typing import Any

from app.llm.client import LLMClient
from app.llm.security import wrap_untrusted
from app.schemas.company import CompanyInsight
from app.schemas.fabrication import UnsupportedClaim
from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import (
    KeywordPlanItem,
    ResumeChange,
    TailoredResume,
)
from app.services.tailoring.ats_scorer import AtsScorer
from app.services.tailoring.fabrication_checker import FabricationChecker
from app.services.tailoring.keyword_planner import KeywordPlanner
from app.services.tailoring.prompts import REWRITE_SYSTEM_PROMPT, REWRITE_USER_TEMPLATE
from app.services.tailoring.schemas import (
    ResumeRewriteLLMOutput,
    RewrittenBullet,
    RewrittenExperience,
)

logger = logging.getLogger("jobpilot.tailor_agent")


class ResumeTailorAgent:
    """Production defensive resume tailoring agent with zero-fabrication guarantees."""

    def __init__(
        self,
        llm_client: LLMClient | None = None,
        keyword_planner: KeywordPlanner | None = None,
        fabrication_checker: FabricationChecker | None = None,
        ats_scorer: AtsScorer | None = None,
    ) -> None:
        self._llm_client = llm_client or LLMClient()
        self._keyword_planner = keyword_planner or KeywordPlanner()
        self._fabrication_checker = fabrication_checker or FabricationChecker(
            llm_client=self._llm_client
        )
        self._ats_scorer = ats_scorer or AtsScorer()

    async def tailor_resume(
        self,
        profile: ParsedProfile,
        job: JobPosting,
        company_insight: CompanyInsight | None = None,
    ) -> TailoredResume:
        """Execute full 5-stage defensive tailoring pipeline."""
        # Stage 1: Keyword Plan (verified evidence vs gaps)
        keyword_plan = self._keyword_planner.build_plan(profile, job)

        # Stage 2: Initial Rewrite Step
        rewrite_output = await self._rewrite_resume(
            profile=profile,
            job=job,
            keyword_plan=keyword_plan,
            company_insight=company_insight,
            forbidden_claims=None,
        )

        # Stage 3: Fabrication Check (Deterministic + Independent LLM pass)
        fabrication_report = await self._fabrication_checker.audit_tailored_resume(
            original_profile=profile,
            tailored=rewrite_output,
        )

        # Auto-retry once if unsupported claims were detected
        if not fabrication_report.passed:
            logger.warning(
                "Tailored resume flagged with %d unsupported claims. Auto-retrying rewrite once...",
                len(fabrication_report.unsupported_claims),
            )
            retried_rewrite = await self._rewrite_resume(
                profile=profile,
                job=job,
                keyword_plan=keyword_plan,
                company_insight=company_insight,
                forbidden_claims=fabrication_report.unsupported_claims,
            )
            # Re-audit retried output
            retried_audit = await self._fabrication_checker.audit_tailored_resume(
                original_profile=profile,
                tailored=retried_rewrite,
            )
            rewrite_output = retried_rewrite
            fabrication_report = retried_audit

        # Assemble updated ParsedProfile sections
        tailored_profile = self._assemble_tailored_profile(profile, rewrite_output)

        # Stage 5: Compute changes list (before/after diff)
        changes = self._compute_diffs(profile, rewrite_output, tailored_profile)

        # Stage 4: Deterministic ATS Report
        ats_report = self._ats_scorer.evaluate(tailored_profile, keyword_plan)

        return TailoredResume(
            sections=tailored_profile,
            changes=changes,
            keyword_plan=keyword_plan,
            ats_report=ats_report,
            fabrication_report=fabrication_report,
        )

    async def _rewrite_resume(
        self,
        profile: ParsedProfile,
        job: JobPosting,
        keyword_plan: list[KeywordPlanItem],
        company_insight: CompanyInsight | None,
        forbidden_claims: list[UnsupportedClaim] | None,
    ) -> ResumeRewriteLLMOutput:
        """Call LLM with structured output and untrusted input delimiters."""
        # 1. Format verified profile data with clear reference tags
        profile_lines: list[str] = [
            f"Candidate Name: {profile.name}",
            f"[profile.summary]: {profile.summary}",
            "Verified Skills: " + ", ".join(f"{s.name} ({s.category})" for s in profile.skills),
            "Work Experience:",
        ]
        for exp_idx, exp in enumerate(profile.experience):
            profile_lines.append(
                f"- [profile.experience[{exp_idx}]] {exp.title} at {exp.company} "
                f"({exp.start} - {exp.end or 'Present'}):"
            )
            if exp.technologies:
                profile_lines.append(f"  Technologies: {', '.join(exp.technologies)}")
            for b_idx, bullet in enumerate(exp.bullets):
                profile_lines.append(
                    f"  [profile.experience[{exp_idx}].bullets[{b_idx}]]: {bullet}"
                )

        if profile.projects:
            profile_lines.append("Projects:")
            for p_idx, proj in enumerate(profile.projects):
                profile_lines.append(
                    f"- [profile.projects[{p_idx}]]: {proj.name} - {proj.description} "
                    f"(Technologies: {', '.join(proj.technologies)})"
                )

        profile_text = "\n".join(profile_lines)

        # 2. Format job description
        job_text = (
            f"Title: {job.title}\n"
            f"Company: {job.company}\n"
            f"Location: {job.location} (Remote: {job.remote})\n"
            f"Required Skills: {', '.join(job.skills_required)}\n\n"
            f"Description:\n{job.description[:2500]}"
        )

        # 3. Format keyword plan
        plan_lines: list[str] = []
        for item in keyword_plan:
            status = "GAP (FORBIDDEN TO CLAIM)" if item.is_gap else f"VERIFIED: {item.evidence}"
            plan_lines.append(f"- {item.keyword} ({item.category}): {status}")
        plan_text = "\n".join(plan_lines)

        # 4. Optional company insight
        insight_text = ""
        if company_insight:
            insight_text = (
                f"Company Mission: {company_insight.summary}\n"
                f"Tech Stack: {', '.join(company_insight.tech_stack)}\n"
                f"Culture Signals: {', '.join(company_insight.culture_signals)}"
            )

        # 5. Forbidden claims if retrying
        forbidden_text = ""
        if forbidden_claims:
            forbidden_lines = [
                "CRITICAL WARNING - PREVIOUS FABRICATION AUDIT REJECTED THESE CLAIMS:",
                "You MUST NOT mention or invent any of the following rejected claims:",
            ]
            for c in forbidden_claims:
                forbidden_lines.append(f"- REJECTED: {c.text} (Reason: {c.reason})")
            forbidden_text = "\n".join(forbidden_lines)

        variables = {
            "candidate_profile_data": wrap_untrusted("candidate_profile", profile_text, 6000),
            "job_posting_data": wrap_untrusted("job_posting", job_text, 4000),
            "keyword_plan_data": wrap_untrusted("keyword_plan", plan_text, 3000),
            "company_insight_data": wrap_untrusted("company_insight", insight_text, 1500)
            if insight_text
            else "None provided.",
            "forbidden_claims_data": wrap_untrusted("forbidden_claims", forbidden_text, 2000)
            if forbidden_text
            else "",
        }

        try:
            return await self._llm_client.generate_structured(
                prompt_template=f"{REWRITE_SYSTEM_PROMPT}\n\n{REWRITE_USER_TEMPLATE}",
                variables=variables,
                output_model=ResumeRewriteLLMOutput,
                temperature=0.1,
                task_name="resume_tailor_rewrite",
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "LLM rewrite failed or timed out (%s); generating safe deterministic baseline.", exc
            )
            return self._build_fallback_rewrite(profile, job, keyword_plan)

    def _assemble_tailored_profile(
        self,
        original: ParsedProfile,
        rewrite: ResumeRewriteLLMOutput,
    ) -> ParsedProfile:
        """Merge tailored textual changes into a copy of the parsed profile."""
        updated = original.model_copy(deep=True)

        if rewrite.tailored_summary:
            updated.summary = rewrite.tailored_summary

        # Update experiences with tailored bullets
        rewrite_exp_by_key = {
            (e.company.strip().lower(), e.title.strip().lower()): e for e in rewrite.experience
        }

        for exp in updated.experience:
            key = (exp.company.strip().lower(), exp.title.strip().lower())
            matched_rewrite = rewrite_exp_by_key.get(key)
            if matched_rewrite and matched_rewrite.bullets:
                exp.bullets = [b.text for b in matched_rewrite.bullets]

        # Prioritize skills_to_highlight
        if rewrite.skills_to_highlight:
            highlight_set = {s.lower() for s in rewrite.skills_to_highlight}
            prioritized: list[Any] = []
            remainder: list[Any] = []
            for s in updated.skills:
                if s.name.lower() in highlight_set:
                    prioritized.append(s)
                else:
                    remainder.append(s)
            updated.skills = prioritized + remainder

        return updated

    def _compute_diffs(
        self,
        original: ParsedProfile,
        rewrite: ResumeRewriteLLMOutput,
        tailored: ParsedProfile,
    ) -> list[ResumeChange]:
        """Compute structured before/after diff list for UI review."""
        changes: list[ResumeChange] = []

        # 1. Summary diff
        if original.summary.strip() != tailored.summary.strip() and tailored.summary.strip():
            changes.append(
                ResumeChange(
                    section="summary",
                    before=original.summary,
                    after=tailored.summary,
                    reason=rewrite.summary_reason
                    or "Tailored professional headline for target job alignment.",
                    source_fact_ref=rewrite.summary_source_fact_ref or "profile.summary",
                )
            )

        # 2. Experience bullet diffs
        for exp_idx, orig_exp in enumerate(original.experience):
            if exp_idx < len(rewrite.experience):
                rew_exp = rewrite.experience[exp_idx]
                for b_idx, rew_bullet in enumerate(rew_exp.bullets):
                    orig_b = orig_exp.bullets[b_idx] if b_idx < len(orig_exp.bullets) else ""
                    if orig_b.strip() != rew_bullet.text.strip():
                        changes.append(
                            ResumeChange(
                                section="experience",
                                before=orig_b,
                                after=rew_bullet.text,
                                reason=rew_bullet.reason
                                or f"Emphasized relevance for {orig_exp.title} role.",
                                source_fact_ref=rew_bullet.source_fact_ref
                                or f"profile.experience[{exp_idx}].bullets[{b_idx}]",
                            )
                        )

        # 3. Skills reordering diff
        if rewrite.skills_to_highlight:
            orig_top = ", ".join(s.name for s in original.skills[:5])
            rew_top = ", ".join(rewrite.skills_to_highlight[:5])
            changes.append(
                ResumeChange(
                    section="skills",
                    before=f"Original skill order: {orig_top}...",
                    after=f"Prioritized for role: {rew_top}...",
                    reason="Reordered existing verified skills to highlight target job match.",
                    source_fact_ref="profile.skills",
                )
            )

        return changes

    def _build_fallback_rewrite(
        self,
        profile: ParsedProfile,
        job: JobPosting,
        keyword_plan: list[KeywordPlanItem],
    ) -> ResumeRewriteLLMOutput:
        """Construct safe, un-hallucinated baseline output if LLM service is offline."""
        matched_kws = [item.keyword for item in keyword_plan if not item.is_gap]
        top_kws_str = ", ".join(matched_kws[:4]) if matched_kws else "software development"

        if profile.summary:
            fallback_summary = (
                f"{profile.summary} Focused on {top_kws_str} "
                f"aligning with {job.title} role at {job.company}."
            )
        else:
            fallback_summary = (
                f"Experienced candidate specializing in {top_kws_str} for {job.title} role."
            )

        rewritten_exps: list[RewrittenExperience] = []
        for exp_idx, exp in enumerate(profile.experience):
            rewritten_bullets = [
                RewrittenBullet(
                    text=b,
                    source_fact_ref=f"profile.experience[{exp_idx}].bullets[{b_idx}]",
                    reason="Maintained original verified achievement bullet.",
                )
                for b_idx, b in enumerate(exp.bullets)
            ]
            rewritten_exps.append(
                RewrittenExperience(
                    company=exp.company,
                    title=exp.title,
                    start=exp.start,
                    end=exp.end,
                    bullets=rewritten_bullets,
                    technologies=exp.technologies,
                )
            )

        reason_str = (
            "Grounded baseline professional headline highlighting matching verified skills."
        )
        return ResumeRewriteLLMOutput(
            tailored_summary=fallback_summary,
            summary_source_fact_ref="profile.summary",
            summary_reason=reason_str,
            experience=rewritten_exps,
            projects=[],
            skills_to_highlight=[s.name for s in profile.skills[:8]],
        )
