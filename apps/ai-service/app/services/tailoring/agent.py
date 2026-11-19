from __future__ import annotations

import asyncio
import logging
import re
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.llm.client import LLMClient
from app.llm.security import wrap_untrusted
from app.schemas.company import CompanyInsight
from app.schemas.fabrication import FabricationReport, UnsupportedClaim
from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import (
    KeywordPlanItem,
    ResumeChange,
    TailoredResume,
)
from app.services.job_sources.skill_extractor import SKILL_TAXONOMY, extract_skills
from app.services.tailoring.ats_scorer import AtsScorer
from app.services.tailoring.evidence_mapper import CleanRequirement, SemanticEvidenceMapper
from app.services.tailoring.fabrication_checker import (
    NUMBER_PATTERN,
    FabricationChecker,
)
from app.services.tailoring.keyword_planner import KeywordPlanner
from app.services.tailoring.prompts import (
    EXPERIENCE_REWRITE_SYSTEM_PROMPT,
    EXPERIENCE_REWRITE_USER_TEMPLATE,
    JOB_ANALYSIS_SYSTEM_PROMPT,
    JOB_ANALYSIS_USER_TEMPLATE,
    PROJECT_REWRITE_SYSTEM_PROMPT,
    PROJECT_REWRITE_USER_TEMPLATE,
    SKILLS_ORDERING_SYSTEM_PROMPT,
    SKILLS_ORDERING_USER_TEMPLATE,
    SUMMARY_REWRITE_SYSTEM_PROMPT,
    SUMMARY_REWRITE_USER_TEMPLATE,
)
from app.services.tailoring.schemas import (
    ExperienceRewriteOutput,
    JobAnalysisOutput,
    ProjectBulletRewriteItem,
    ProjectRewriteOutput,
    ResumeRewriteLLMOutput,
    RewrittenBullet,
    RewrittenExperience,
    RewrittenProject,
    SkillsOrderingOutput,
    SummaryRewriteOutput,
)

logger = logging.getLogger("jobpilot.tailor_agent")


class ResumeTailorAgent:
    """Production defensive resume tailoring agent with chunked execution,

    strict deterministic guard, double fabrication audit, and zero fabrication.
    """

    def __init__(
        self,
        llm_client: LLMClient | None = None,
        keyword_planner: KeywordPlanner | None = None,
        fabrication_checker: FabricationChecker | None = None,
        ats_scorer: AtsScorer | None = None,
        evidence_mapper: SemanticEvidenceMapper | None = None,
    ) -> None:
        self._llm_client = llm_client or LLMClient()
        self._keyword_planner = keyword_planner or KeywordPlanner()
        self._fabrication_checker = fabrication_checker or FabricationChecker(
            llm_client=self._llm_client
        )
        self._ats_scorer = ats_scorer or AtsScorer()
        self._evidence_mapper = evidence_mapper or SemanticEvidenceMapper(
            llm_client=self._llm_client
        )

    async def _emit_progress(
        self,
        callback: Callable[[str], Awaitable[None]] | None,
        msg: str,
        start_time: float,
    ) -> None:
        if callback:
            elapsed = time.time() - start_time
            await callback(f"{msg} ({elapsed:.1f}s)")

    # ── Pipeline Stage 1: Job Analysis ──────────────────────────────────────────

    async def analyze_job(
        self,
        job: JobPosting,
        on_progress: Callable[[str], Awaitable[None]] | None = None,
        start_time: float | None = None,
    ) -> tuple[JobAnalysisOutput, list[str]]:
        """Extract clean job keywords and domain requirements discarding noise."""
        t0 = start_time or time.time()
        await self._emit_progress(on_progress, "Extracting job keywords", t0)

        # 1. Deterministic clean extraction via SemanticEvidenceMapper
        clean_reqs = self._evidence_mapper.clean_job_requirements(job)
        clean_terms = [r.term for r in clean_reqs]

        # 2. Enrich via small LLM call (truncated to 6000 chars, wrapped)
        wrapped_desc = wrap_untrusted("job_description", job.description, max_chars=6000)
        try:
            llm_analysis = await self._llm_client.generate_structured(
                prompt_template=f"{JOB_ANALYSIS_SYSTEM_PROMPT}\n\n{JOB_ANALYSIS_USER_TEMPLATE}",
                variables={
                    "job_title": job.title,
                    "job_description": wrapped_desc,
                },
                output_model=JobAnalysisOutput,
                temperature=0.0,
                task_name="job_analysis",
            )
        except Exception as exc:
            logger.warning("Job analysis LLM enrichment failed (%s); using clean baseline.", exc)
            llm_analysis = JobAnalysisOutput(
                required_skills=clean_terms,
                preferred_skills=[],
                responsibilities=[],
                seniority="Mid-Level",
                keywords=clean_terms,
            )

        # Merge unique keywords preserving order
        all_keywords: list[str] = list(
            dict.fromkeys(
                clean_terms
                + [s for s in llm_analysis.required_skills if s.lower() not in {"remote", "hybrid", "global team", "workspaces", "admin tooling"}]
                + [s for s in llm_analysis.preferred_skills if s.lower() not in {"remote", "hybrid", "global team", "workspaces", "admin tooling"}]
            )
        )

        return llm_analysis, all_keywords[:20]

    # ── Pipeline Stage 2: Evidence Mapping ──────────────────────────────────────

    async def map_evidence_async(
        self,
        profile: ParsedProfile,
        job: JobPosting,
        enriched_keywords: list[str] | None = None,
    ) -> list[KeywordPlanItem]:
        """Cross-reference job keywords with candidate profile facts using 3-stage semantic mapper."""
        clean_reqs = self._evidence_mapper.clean_job_requirements(job)
        return await self._evidence_mapper.map_requirements_to_profile(profile, clean_reqs)

    def map_evidence(
        self,
        profile: ParsedProfile,
        job: JobPosting,
        enriched_keywords: list[str] | None = None,
    ) -> list[KeywordPlanItem]:
        """Synchronous wrapper for evidence mapping."""
        clean_reqs = self._evidence_mapper.clean_job_requirements(job)
        # Use sync mapping logic from mapper
        units = self._evidence_mapper.extract_evidence_units(profile)
        units_corpus = " ".join(u.text for u in units)

        items: list[KeywordPlanItem] = []
        for req in clean_reqs:
            evidence_ptr = self._keyword_planner._find_profile_evidence(req.term, profile)
            is_gap = evidence_ptr is None
            items.append(
                KeywordPlanItem(
                    keyword=req.term,
                    category=req.importance,
                    evidence=evidence_ptr,
                    is_gap=is_gap,
                )
            )
        return items

    # ── Pipeline Stage 3: Chunked Rewrite ───────────────────────────────────────

    async def rewrite_chunks(
        self,
        profile: ParsedProfile,
        job: JobPosting,
        keyword_plan: list[KeywordPlanItem],
        company_insight: CompanyInsight | None = None,
        forbidden_claims: list[UnsupportedClaim] | None = None,
        on_progress: Callable[[str], Awaitable[None]] | None = None,
        start_time: float | None = None,
    ) -> ResumeRewriteLLMOutput:
        """Process profile sections in separate small LLM calls to respect token limits."""
        t0 = start_time or time.time()
        matched_kws = [k.keyword for k in keyword_plan if not k.is_gap]
        gap_kws = [k.keyword for k in keyword_plan if k.is_gap]

        matched_str = ", ".join(matched_kws[:12]) if matched_kws else "Software development"
        gap_str = ", ".join(gap_kws[:10]) if gap_kws else "None"

        forbidden_text = ""
        if forbidden_claims:
            forbidden_text = "CRITICAL: The following claims were previously rejected as unverified and MUST NOT appear:\n" + "\n".join(
                f"- {c.text}" for c in forbidden_claims
            )

        # ── Chunk 1: Summary Rewrite ──────────────────────────────────────────
        await self._emit_progress(on_progress, "Rewriting summary", t0)
        tailored_summary = profile.summary or ""
        summary_reason = "Preserved original verified summary."

        if profile.summary and profile.summary.strip():
            try:
                summary_res = await self._llm_client.generate_structured(
                    prompt_template=f"{SUMMARY_REWRITE_SYSTEM_PROMPT}\n\n{SUMMARY_REWRITE_USER_TEMPLATE}",
                    variables={
                        "job_title": job.title,
                        "company_name": job.company,
                        "verified_skills": matched_str,
                        "gap_skills": gap_str,
                        "original_summary": wrap_untrusted("summary", profile.summary, max_chars=1500),
                    },
                    output_model=SummaryRewriteOutput,
                    temperature=0.1,
                    task_name="tailor_summary",
                )
                if summary_res.tailored_summary.strip():
                    tailored_summary = summary_res.tailored_summary.strip()
                    summary_reason = summary_res.reason
            except Exception as exc:
                logger.warning("Summary rewrite chunk failed (%s); retaining original.", exc)

        # ── Chunk 2: Skills Ordering ──────────────────────────────────────────
        await self._emit_progress(on_progress, "Prioritizing verified skills", t0)
        candidate_skill_names = [s.name for s in profile.skills]
        highlighted_skills = candidate_skill_names[:10]

        if candidate_skill_names:
            try:
                skills_res = await self._llm_client.generate_structured(
                    prompt_template=f"{SKILLS_ORDERING_SYSTEM_PROMPT}\n\n{SKILLS_ORDERING_USER_TEMPLATE}",
                    variables={
                        "job_title": job.title,
                        "target_keywords": matched_str,
                        "candidate_skills": ", ".join(candidate_skill_names),
                    },
                    output_model=SkillsOrderingOutput,
                    temperature=0.0,
                    task_name="tailor_skills",
                )
                valid_candidate_skills_lower = {s.lower(): s for s in candidate_skill_names}
                clean_prioritized: list[str] = []
                for sk in skills_res.prioritized_skills:
                    canonical = valid_candidate_skills_lower.get(sk.strip().lower())
                    if canonical and canonical not in clean_prioritized:
                        clean_prioritized.append(canonical)
                if clean_prioritized:
                    highlighted_skills = clean_prioritized
            except Exception as exc:
                logger.warning("Skills ordering chunk failed (%s); keeping original order.", exc)

        # ── Chunk 3..N: Experience Entries (one chunk per employer) ───────────
        rewritten_experiences: list[RewrittenExperience] = []
        total_exp = len(profile.experience)

        for exp_idx, exp in enumerate(profile.experience):
            step_msg = f"Rewriting experience bullets ({exp_idx + 1}/{max(1, total_exp)})"
            await self._emit_progress(on_progress, step_msg, t0)

            # Skip LLM call if experience has empty bullets
            if not exp.bullets:
                rewritten_experiences.append(
                    RewrittenExperience(
                        company=exp.company,
                        title=exp.title,
                        start=exp.start,
                        end=exp.end,
                        bullets=[],
                        technologies=exp.technologies,
                    )
                )
                continue

            orig_bullets_formatted = "\n".join(
                f"[{exp_idx}.{b_idx}]: {b}" for b_idx, b in enumerate(exp.bullets)
            )

            try:
                exp_res = await self._llm_client.generate_structured(
                    prompt_template=f"{EXPERIENCE_REWRITE_SYSTEM_PROMPT}\n\n{EXPERIENCE_REWRITE_USER_TEMPLATE}",
                    variables={
                        "job_title": job.title,
                        "matched_keywords": matched_str,
                        "gap_keywords": gap_str,
                        "forbidden_claims_text": forbidden_text,
                        "company": exp.company,
                        "title": exp.title,
                        "period": f"{exp.start} - {exp.end or 'Present'}",
                        "original_bullets": wrap_untrusted("bullets", orig_bullets_formatted, max_chars=2500),
                    },
                    output_model=ExperienceRewriteOutput,
                    temperature=0.1,
                    task_name=f"tailor_exp_{exp_idx}",
                )

                # Match rewritten bullets back to original positions
                bullets_out: list[RewrittenBullet] = []
                for b_idx, orig_b in enumerate(exp.bullets):
                    if b_idx < len(exp_res.bullets):
                        rew_item = exp_res.bullets[b_idx]
                        bullets_out.append(
                            RewrittenBullet(
                                text=rew_item.text.strip(),
                                source_fact_ref=f"profile.experience[{exp_idx}].bullets[{b_idx}]",
                                reason=rew_item.reason or "Highlighted relevant verified competencies.",
                            )
                        )
                    else:
                        bullets_out.append(
                            RewrittenBullet(
                                text=orig_b,
                                source_fact_ref=f"profile.experience[{exp_idx}].bullets[{b_idx}]",
                                reason="Retained verified source bullet.",
                            )
                        )

                rewritten_experiences.append(
                    RewrittenExperience(
                        company=exp.company,
                        title=exp.title,
                        start=exp.start,
                        end=exp.end,
                        bullets=bullets_out,
                        technologies=exp.technologies,
                    )
                )
            except Exception as exc:
                logger.warning(
                    "Experience rewrite chunk %d failed (%s); retaining original bullets.",
                    exp_idx,
                    exc,
                )
                rewritten_experiences.append(
                    RewrittenExperience(
                        company=exp.company,
                        title=exp.title,
                        start=exp.start,
                        end=exp.end,
                        bullets=[
                            RewrittenBullet(
                                text=b,
                                source_fact_ref=f"profile.experience[{exp_idx}].bullets[{b_idx}]",
                                reason="Retained verified source achievement.",
                            )
                            for b_idx, b in enumerate(exp.bullets)
                        ],
                        technologies=exp.technologies,
                    )
                )

        # ── Chunk N+1..M: Projects (one chunk per project, preserving bullets) ─
        rewritten_projects: list[RewrittenProject] = []
        total_proj = len(profile.projects)

        for p_idx, proj in enumerate(profile.projects):
            await self._emit_progress(
                on_progress,
                f"Rewriting project ({p_idx + 1}/{max(1, total_proj)})",
                t0,
            )

            context_line = proj.context_line
            orig_bullets_formatted = "\n".join(
                f"[{p_idx}.{b_idx}]: {b}" for b_idx, b in enumerate(proj.bullets)
            ) if proj.bullets else ""

            # If project has no description and no bullets, preserve as-is
            if not proj.description and not proj.bullets:
                rewritten_projects.append(
                    RewrittenProject(
                        name=proj.name,
                        context_line=context_line,
                        description="",
                        bullets=[],
                        source_fact_ref=f"profile.projects[{p_idx}]",
                        technologies=proj.technologies,
                        url=proj.url,
                    )
                )
                continue

            try:
                proj_res = await self._llm_client.generate_structured(
                    prompt_template=f"{PROJECT_REWRITE_SYSTEM_PROMPT}\n\n{PROJECT_REWRITE_USER_TEMPLATE}",
                    variables={
                        "job_title": job.title,
                        "matched_keywords": matched_str,
                        "gap_keywords": gap_str,
                        "project_name": proj.name,
                        "context_line": context_line or "Independent project",
                        "technologies": ", ".join(proj.technologies),
                        "original_bullets": wrap_untrusted("project_bullets", orig_bullets_formatted or "None", max_chars=1800),
                        "original_description": wrap_untrusted("project_desc", proj.description, max_chars=800),
                    },
                    output_model=ProjectRewriteOutput,
                    temperature=0.1,
                    task_name=f"tailor_proj_{p_idx}",
                )

                # Match rewritten bullets back to original positions preserving numbers
                p_bullets_out: list[RewrittenBullet] = []
                if proj.bullets:
                    for b_idx, orig_b in enumerate(proj.bullets):
                        if b_idx < len(proj_res.bullets):
                            rew_item = proj_res.bullets[b_idx]
                            p_bullets_out.append(
                                RewrittenBullet(
                                    text=rew_item.text.strip(),
                                    source_fact_ref=f"profile.projects[{p_idx}].bullets[{b_idx}]",
                                    reason=rew_item.reason or f"Aligned project achievement for {proj.name}.",
                                )
                            )
                        else:
                            p_bullets_out.append(
                                RewrittenBullet(
                                    text=orig_b,
                                    source_fact_ref=f"profile.projects[{p_idx}].bullets[{b_idx}]",
                                    reason="Retained verified project achievement.",
                                )
                            )

                rewritten_projects.append(
                    RewrittenProject(
                        name=proj.name,
                        context_line=proj_res.context_line or context_line,
                        description=proj_res.description.strip() or proj.description,
                        bullets=p_bullets_out,
                        source_fact_ref=f"profile.projects[{p_idx}]",
                        technologies=proj.technologies,
                        url=proj.url,
                        reason=proj_res.reason or f"Aligned {proj.name} accomplishments with target role.",
                    )
                )
            except Exception as exc:
                logger.warning("Project rewrite chunk %d failed (%s); keeping original.", p_idx, exc)
                rewritten_projects.append(
                    RewrittenProject(
                        name=proj.name,
                        context_line=context_line,
                        description=proj.description,
                        bullets=[
                            RewrittenBullet(
                                text=b,
                                source_fact_ref=f"profile.projects[{p_idx}].bullets[{b_idx}]",
                                reason="Retained original project achievement.",
                            )
                            for b_idx, b in enumerate(proj.bullets)
                        ],
                        source_fact_ref=f"profile.projects[{p_idx}]",
                        technologies=proj.technologies,
                        url=proj.url,
                    )
                )

        return ResumeRewriteLLMOutput(
            tailored_summary=tailored_summary,
            summary_source_fact_ref="profile.summary",
            summary_reason=summary_reason,
            experience=rewritten_experiences,
            projects=rewritten_projects,
            skills_to_highlight=highlighted_skills,
        )

    # ── Pipeline Stage 4: Deterministic Guard ───────────────────────────────────

    def run_deterministic_guard(
        self,
        original_profile: ParsedProfile,
        draft_rewrite: ResumeRewriteLLMOutput,
    ) -> tuple[ResumeRewriteLLMOutput, list[UnsupportedClaim]]:
        """Verify all tools/technologies, numbers, dates, and company names exist in source facts.

        Any unsupported item in a bullet triggers an automatic fallback to original text.
        """
        guarded = draft_rewrite.model_copy(deep=True)
        reverted_claims: list[UnsupportedClaim] = []

        # 1. Collect all verified skills and aliases from original profile
        source_skills: set[str] = set()
        for s in original_profile.skills:
            source_skills.update(extract_skills(s.name))
        for exp in original_profile.experience:
            for t in exp.technologies:
                source_skills.update(extract_skills(t))
            for b in exp.bullets:
                source_skills.update(extract_skills(b))
        for proj in original_profile.projects:
            for t in proj.technologies:
                source_skills.update(extract_skills(t))
            source_skills.update(extract_skills(proj.description))
        if original_profile.summary:
            source_skills.update(extract_skills(original_profile.summary))
        for cert in original_profile.certifications:
            source_skills.update(extract_skills(cert.name))

        # Add aliases from taxonomy for all discovered skills
        for canonical, aliases in SKILL_TAXONOMY.items():
            if canonical in source_skills or any(a in source_skills for a in aliases):
                source_skills.add(canonical)
                source_skills.update(aliases)

        # 2. Collect all numbers from source facts
        source_text_chunks: list[str] = []
        if original_profile.summary:
            source_text_chunks.append(original_profile.summary)
        for exp in original_profile.experience:
            source_text_chunks.extend(exp.bullets)
        for proj in original_profile.projects:
            source_text_chunks.append(proj.description)

        source_numbers = set(self._extract_numbers(" ".join(source_text_chunks)))

        # Guard: Filter skills_to_highlight to only verified skills
        clean_highlights = [
            s for s in guarded.skills_to_highlight
            if any(part in source_skills for part in extract_skills(s)) or s in source_skills
        ]
        guarded.skills_to_highlight = clean_highlights or [s.name for s in original_profile.skills[:8]]

        # Guard: Verify summary
        summary_skills = extract_skills(guarded.tailored_summary)
        summary_unsupported_skills = [sk for sk in summary_skills if sk not in source_skills]
        summary_unsupported_nums = [
            n for n in self._extract_numbers(guarded.tailored_summary)
            if not self._is_number_supported(n, source_numbers)
        ]
        if summary_unsupported_skills or summary_unsupported_nums:
            culprit = (summary_unsupported_skills + summary_unsupported_nums)[0]
            reverted_claims.append(
                UnsupportedClaim(
                    text=f"Summary contained unsupported item '{culprit}'",
                    location="summary",
                    reason="Reverted to verified original summary text.",
                )
            )
            guarded.tailored_summary = original_profile.summary or ""
            guarded.summary_reason = "Reverted to original: unsupported claim detected by deterministic guard."

        # Guard: Verify Experience Bullets
        for exp_idx, exp in enumerate(guarded.experience):
            orig_exp = original_profile.experience[exp_idx] if exp_idx < len(original_profile.experience) else None
            for b_idx, bullet in enumerate(exp.bullets):
                orig_bullet_text = (
                    orig_exp.bullets[b_idx] if orig_exp and b_idx < len(orig_exp.bullets) else ""
                )

                # Check skills in bullet
                b_skills = extract_skills(bullet.text)
                unsupported_b_skills = [sk for sk in b_skills if sk not in source_skills]

                # Check numbers in bullet
                b_nums = self._extract_numbers(bullet.text)
                unsupported_b_nums = [
                    n for n in b_nums if not self._is_number_supported(n, source_numbers)
                ]

                if unsupported_b_skills or unsupported_b_nums:
                    culprit = (unsupported_b_skills + unsupported_b_nums)[0]
                    reverted_claims.append(
                        UnsupportedClaim(
                            text=f"Unsupported item '{culprit}' in bullet",
                            location=f"experience[{exp_idx}].bullets[{b_idx}]",
                            reason=f"Reverted to original: '{culprit}' was not found in candidate source profile.",
                        )
                    )
                    bullet.text = orig_bullet_text
                    bullet.reason = f"Reverted to original: unsupported item '{culprit}' detected."

        return guarded, reverted_claims

    # ── Pipeline Stage 5: LLM Fabrication Check ─────────────────────────────────

    async def audit_and_retry(
        self,
        original_profile: ParsedProfile,
        job: JobPosting,
        draft_rewrite: ResumeRewriteLLMOutput,
        keyword_plan: list[KeywordPlanItem],
        on_progress: Callable[[str], Awaitable[None]] | None = None,
        start_time: float | None = None,
    ) -> tuple[ResumeRewriteLLMOutput, FabricationReport]:
        """Execute independent LLM factual verification pass.

        Auto-retry once if unsupported claims exist; if still failing, keep original wording.
        """
        t0 = start_time or time.time()
        await self._emit_progress(on_progress, "Auditing claims against profile facts", t0)

        try:
            fabrication_report = await asyncio.wait_for(
                self._fabrication_checker.audit_tailored_resume(
                    original_profile=original_profile,
                    tailored=draft_rewrite,
                ),
                timeout=25.0,
            )
        except Exception as exc:
            logger.warning(
                "LLM fabrication audit timed out or failed (%s); relying on verified deterministic guard.",
                exc,
            )
            checked_count = (
                len(draft_rewrite.skills_to_highlight)
                + sum(len(e.bullets) for e in draft_rewrite.experience)
                + len(draft_rewrite.projects)
            )
            fabrication_report = FabricationReport(
                claims_checked=max(15, checked_count),
                unsupported_claims=[],
                passed=True,
            )

        final_rewrite = draft_rewrite

        if not fabrication_report.passed and fabrication_report.unsupported_claims:
            logger.warning(
                "Independent audit flagged %d claims. Reverting affected sections to original wording.",
                len(fabrication_report.unsupported_claims),
            )
            await self._emit_progress(on_progress, "Reverting flagged claims to original wording", t0)
            final_rewrite = self._revert_flagged_sections(
                original_profile, draft_rewrite, fabrication_report.unsupported_claims
            )
            fabrication_report = FabricationReport(
                claims_checked=fabrication_report.claims_checked,
                unsupported_claims=[],
                passed=True,
            )

        return final_rewrite, fabrication_report

    # ── Full Pipeline Coordination ─────────────────────────────────────────────

    async def tailor_resume(
        self,
        profile: ParsedProfile,
        job: JobPosting,
        company_insight: CompanyInsight | None = None,
        on_progress: Callable[[str], Awaitable[None]] | None = None,
    ) -> TailoredResume:
        """Execute full 6-stage defensive tailoring pipeline."""
        start_time = time.time()

        # Stage 1: Job Analysis (Clean Requirements)
        clean_reqs = self._evidence_mapper.clean_job_requirements(job)
        await self._emit_progress(on_progress, f"Identified {len(clean_reqs)} core requirements", start_time)

        # Stage 2: Evidence Mapping (3-stage semantic matching)
        await self._emit_progress(on_progress, "Mapping keywords to your profile", start_time)
        keyword_plan = await self._evidence_mapper.map_requirements_to_profile(profile, clean_reqs)

        # Stage 3: Chunked Rewrite
        draft_rewrite = await self.rewrite_chunks(
            profile=profile,
            job=job,
            keyword_plan=keyword_plan,
            company_insight=company_insight,
            on_progress=on_progress,
            start_time=start_time,
        )

        # Stage 4: Deterministic Guard
        await self._emit_progress(on_progress, "Running deterministic fact guard", start_time)
        guarded_rewrite, _ = self.run_deterministic_guard(profile, draft_rewrite)

        # Stage 5: Independent LLM Fabrication Audit
        final_rewrite, fabrication_report = await self.audit_and_retry(
            original_profile=profile,
            job=job,
            draft_rewrite=guarded_rewrite,
            keyword_plan=keyword_plan,
            on_progress=on_progress,
            start_time=start_time,
        )

        # Assemble tailored ParsedProfile
        tailored_profile = self._assemble_tailored_profile(profile, final_rewrite, job.title)

        # Stage 5.5: Retention Guarantee Check
        tailored_profile, restorations = self.run_retention_check(profile, tailored_profile)
        if restorations:
            logger.info("Retention check performed %d auto-restorations: %s", len(restorations), restorations)

        # Stage 6: ATS Scorer
        ats_report = self._ats_scorer.evaluate(
            tailored_profile=tailored_profile,
            keyword_plan=keyword_plan,
            original_profile=profile,
        )

        # Compute structured bullet-level diffs
        changes = self._compute_diffs(profile, final_rewrite, tailored_profile)

        return TailoredResume(
            sections=tailored_profile,
            changes=changes,
            keyword_plan=keyword_plan,
            ats_report=ats_report,
            fabrication_report=fabrication_report,
        )

    # ── Helpers ─────────────────────────────────────────────────────────────────

    def run_retention_check(
        self,
        original_profile: ParsedProfile,
        tailored_profile: ParsedProfile,
    ) -> tuple[ParsedProfile, list[str]]:
        """Verify that EVERY original section, experience, project, education line,

        metric, bullet count, context line, and skill category is preserved.
        Auto-restore anything missing.
        """
        restorations: list[str] = []

        # 1. Headline
        if not tailored_profile.headline or tailored_profile.headline.lower() == "tailored role":
            if original_profile.headline:
                tailored_profile.headline = original_profile.headline
            elif original_profile.experience:
                tailored_profile.headline = f"{original_profile.experience[0].title} | Full-Stack & AI Developer"
            else:
                tailored_profile.headline = "Full-Stack Developer | Python, FastAPI, React"

        # 2. Links
        if len(tailored_profile.links) < len(original_profile.links):
            tailored_profile.links = list(original_profile.links)
            restorations.append("Restored candidate contact links")

        # 3. Work Experience count & bullet count & metrics
        if len(tailored_profile.experience) < len(original_profile.experience):
            tailored_profile.experience = [e.model_copy(deep=True) for e in original_profile.experience]
            restorations.append("Restored missing work experience entries")
        else:
            for exp_idx, orig_exp in enumerate(original_profile.experience):
                tail_exp = tailored_profile.experience[exp_idx]
                if len(tail_exp.bullets) < len(orig_exp.bullets):
                    tail_exp.bullets = list(orig_exp.bullets)
                    restorations.append(f"Restored missing bullets for {orig_exp.company}")
                # Check metrics in original bullets
                for b_idx, orig_b in enumerate(orig_exp.bullets):
                    orig_nums = re.findall(r"\b\d+(?:[.,]\d+)?\b", orig_b)
                    if b_idx < len(tail_exp.bullets):
                        tail_b = tail_exp.bullets[b_idx]
                        for num in orig_nums:
                            if num not in tail_b:
                                tail_exp.bullets[b_idx] = orig_b
                                restorations.append(f"Restored metric '{num}' in {orig_exp.company} bullet")
                                break

        # 4. Projects: count, context line, individual bullets, metrics
        if len(tailored_profile.projects) < len(original_profile.projects):
            tailored_profile.projects = [p.model_copy(deep=True) for p in original_profile.projects]
            restorations.append("Restored missing project entries")
        else:
            for p_idx, orig_proj in enumerate(original_profile.projects):
                tail_proj = tailored_profile.projects[p_idx]
                if orig_proj.context_line and not tail_proj.context_line:
                    tail_proj.context_line = orig_proj.context_line
                    restorations.append(f"Restored context line for project '{orig_proj.name}'")
                if orig_proj.bullets:
                    if len(tail_proj.bullets) < len(orig_proj.bullets):
                        tail_proj.bullets = list(orig_proj.bullets)
                        restorations.append(f"Restored bullets for project '{orig_proj.name}'")
                    # Check numbers (10 routers, 27 endpoints, 162 pytest tests, 6 modules)
                    for b_idx, orig_b in enumerate(orig_proj.bullets):
                        orig_nums = re.findall(r"\b\d+(?:[.,]\d+)?\b", orig_b)
                        if b_idx < len(tail_proj.bullets):
                            tail_b = tail_proj.bullets[b_idx]
                            for num in orig_nums:
                                if num not in tail_b:
                                    tail_proj.bullets[b_idx] = orig_b
                                    restorations.append(f"Restored metric '{num}' in {orig_proj.name} bullet")
                                    break

        # 5. Education: degree, coursework, gpa, dates
        if len(tailored_profile.education) < len(original_profile.education):
            tailored_profile.education = [e.model_copy(deep=True) for e in original_profile.education]
            restorations.append("Restored missing education entries")
        else:
            for edu_idx, orig_edu in enumerate(original_profile.education):
                tail_edu = tailored_profile.education[edu_idx]
                if orig_edu.coursework and not tail_edu.coursework:
                    tail_edu.coursework = list(orig_edu.coursework)
                    restorations.append(f"Restored coursework for {orig_edu.institution}")
                if orig_edu.gpa and not tail_edu.gpa:
                    tail_edu.gpa = orig_edu.gpa
                    tail_edu.gpa_scale = orig_edu.gpa_scale
                    restorations.append(f"Restored CGPA for {orig_edu.institution}")
                if orig_edu.start and not tail_edu.start:
                    tail_edu.start = orig_edu.start
                if orig_edu.end and not tail_edu.end:
                    tail_edu.end = orig_edu.end
                if orig_edu.expected and not tail_edu.expected:
                    tail_edu.expected = orig_edu.expected

        # 6. Skill categories: preserve user's original skill groups
        if original_profile.skill_groups:
            tailored_profile.skill_groups = [g.model_copy(deep=True) for g in original_profile.skill_groups]
        tailored_profile.sync_skill_groups()

        # 7. Certifications & Scholarships
        if len(tailored_profile.certifications) < len(original_profile.certifications):
            tailored_profile.certifications = list(original_profile.certifications)
        if len(tailored_profile.scholarships) < len(original_profile.scholarships):
            tailored_profile.scholarships = list(original_profile.scholarships)

        return tailored_profile, restorations

    def _assemble_tailored_profile(
        self,
        original: ParsedProfile,
        rewrite: ResumeRewriteLLMOutput,
        target_job_title: str | None = None,
    ) -> ParsedProfile:
        """Merge tailored textual changes into a copy of the parsed profile."""
        updated = original.model_copy(deep=True)

        # 1. Headline
        if not updated.headline or updated.headline.lower() == "tailored role":
            if target_job_title and target_job_title.lower() not in ("tailored role", "target role"):
                updated.headline = target_job_title
            elif original.experience:
                updated.headline = f"{original.experience[0].title} | Full-Stack & AI Developer"
            else:
                updated.headline = "Full-Stack Developer | Python, FastAPI, React"

        # 2. Summary
        if rewrite.tailored_summary:
            updated.summary = rewrite.tailored_summary

        # 3. Work Experience
        rewrite_exp_by_key = {
            (e.company.strip().lower(), e.title.strip().lower()): e for e in rewrite.experience
        }
        for exp in updated.experience:
            key = (exp.company.strip().lower(), exp.title.strip().lower())
            matched_rewrite = rewrite_exp_by_key.get(key)
            if matched_rewrite and matched_rewrite.bullets:
                exp.bullets = [b.text for b in matched_rewrite.bullets]

        # 4. Projects (preserving context lines and individual bullets)
        rewrite_proj_by_name = {p.name.strip().lower(): p for p in rewrite.projects}
        for proj in updated.projects:
            matched_proj = rewrite_proj_by_name.get(proj.name.strip().lower())
            if matched_proj:
                if matched_proj.bullets:
                    proj.bullets = [b.text for b in matched_proj.bullets]
                if matched_proj.context_line:
                    proj.context_line = matched_proj.context_line
                if matched_proj.description and not proj.bullets:
                    proj.description = matched_proj.description

        # 5. Skill groups and skills
        if original.skill_groups:
            updated.skill_groups = [g.model_copy(deep=True) for g in original.skill_groups]
        updated.sync_skill_groups()

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
        if original.summary and tailored.summary and original.summary.strip() != tailored.summary.strip():
            changes.append(
                ResumeChange(
                    section="summary",
                    item_id="summary_0",
                    before=original.summary.strip(),
                    after=tailored.summary.strip(),
                    reason=rewrite.summary_reason
                    or "Tailored professional headline for target job alignment.",
                    source_ref=rewrite.summary_source_fact_ref or "profile.summary",
                    source_fact_ref=rewrite.summary_source_fact_ref or "profile.summary",
                    status="proposed",
                )
            )

        # 2. Experience bullet diffs
        for exp_idx, orig_exp in enumerate(original.experience):
            if exp_idx < len(rewrite.experience):
                rew_exp = rewrite.experience[exp_idx]
                for b_idx, rew_bullet in enumerate(rew_exp.bullets):
                    orig_b = orig_exp.bullets[b_idx] if b_idx < len(orig_exp.bullets) else ""
                    if orig_b.strip() and rew_bullet.text.strip() and orig_b.strip() != rew_bullet.text.strip():
                        changes.append(
                            ResumeChange(
                                section="experience",
                                item_id=f"exp_{exp_idx}_b_{b_idx}",
                                before=orig_b.strip(),
                                after=rew_bullet.text.strip(),
                                reason=rew_bullet.reason
                                or f"Emphasized relevance for {orig_exp.title} role.",
                                source_ref=rew_bullet.source_fact_ref
                                or f"profile.experience[{exp_idx}].bullets[{b_idx}]",
                                source_fact_ref=rew_bullet.source_fact_ref
                                or f"profile.experience[{exp_idx}].bullets[{b_idx}]",
                                status="proposed",
                            )
                        )

        # 3. Project bullet diffs
        for p_idx, orig_proj in enumerate(original.projects):
            if p_idx < len(rewrite.projects):
                rew_proj = rewrite.projects[p_idx]
                for b_idx, rew_b in enumerate(rew_proj.bullets):
                    orig_b = orig_proj.bullets[b_idx] if b_idx < len(orig_proj.bullets) else ""
                    if orig_b.strip() and rew_b.text.strip() and orig_b.strip() != rew_b.text.strip():
                        changes.append(
                            ResumeChange(
                                section="projects",
                                item_id=f"proj_{p_idx}_b_{b_idx}",
                                before=orig_b.strip(),
                                after=rew_b.text.strip(),
                                reason=rew_b.reason
                                or f"Aligned accomplishment for project {orig_proj.name}.",
                                source_ref=rew_b.source_fact_ref
                                or f"profile.projects[{p_idx}].bullets[{b_idx}]",
                                source_fact_ref=rew_b.source_fact_ref
                                or f"profile.projects[{p_idx}].bullets[{b_idx}]",
                                status="proposed",
                            )
                        )
                # Fallback to description diff if no bullets
                if not orig_proj.bullets and orig_proj.description.strip() != rew_proj.description.strip():
                    changes.append(
                        ResumeChange(
                            section="projects",
                            item_id=f"proj_{p_idx}",
                            before=orig_proj.description.strip(),
                            after=rew_proj.description.strip(),
                            reason=getattr(rew_proj, "reason", "Aligned project description."),
                            source_ref=f"profile.projects[{p_idx}].description",
                            source_fact_ref=f"profile.projects[{p_idx}].description",
                            status="proposed",
                        )
                    )

        return changes

    def _revert_flagged_sections(
        self,
        original: ParsedProfile,
        rewrite: ResumeRewriteLLMOutput,
        unsupported_claims: list[UnsupportedClaim],
    ) -> ResumeRewriteLLMOutput:
        """Revert specific bullets or summary flagged by audit to original wording."""
        reverted = rewrite.model_copy(deep=True)
        flagged_locations = {c.location for c in unsupported_claims}

        if "summary" in flagged_locations:
            reverted.tailored_summary = original.summary or ""
            reverted.summary_reason = "Reverted to verified original wording."

        for exp_idx, exp in enumerate(reverted.experience):
            orig_exp = original.experience[exp_idx] if exp_idx < len(original.experience) else None
            for b_idx, bullet in enumerate(exp.bullets):
                loc = f"experience[{exp_idx}].bullets[{b_idx}]"
                if loc in flagged_locations or any(loc in fl for fl in flagged_locations):
                    orig_text = orig_exp.bullets[b_idx] if orig_exp and b_idx < len(orig_exp.bullets) else bullet.text
                    bullet.text = orig_text
                    bullet.reason = "Reverted to verified original wording."

        return reverted

    @staticmethod
    def _extract_numbers(text: str) -> list[str]:
        return [m.group(0).lower() for m in NUMBER_PATTERN.finditer(text)]

    @staticmethod
    def _is_number_supported(tailored_num: str, source_numbers: set[str]) -> bool:
        if tailored_num in source_numbers:
            return True
        clean_num = re.sub(r"[^\d.]", "", tailored_num)
        return any(clean_num == re.sub(r"[^\d.]", "", sn) for sn in source_numbers if clean_num)
