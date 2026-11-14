from __future__ import annotations

import logging
import re
from typing import Final

from app.llm.client import LLMClient
from app.llm.security import wrap_untrusted
from app.schemas.fabrication import FabricationReport, UnsupportedClaim
from app.schemas.profile import ParsedProfile
from app.services.job_sources.skill_extractor import extract_skills
from app.services.tailoring.prompts import AUDIT_SYSTEM_PROMPT, AUDIT_USER_TEMPLATE
from app.services.tailoring.schemas import FabricationAuditLLMOutput, ResumeRewriteLLMOutput

logger = logging.getLogger("jobpilot.fabrication")

# Pattern for numbers, metrics, percentages, multipliers, currency
NUMBER_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"[\$€£]?\d+(?:[.,]\d+)?(?:%|[a-zA-Z]+)?",
    re.IGNORECASE,
)


class FabricationChecker:
    """Rigorous dual-stage truthfulness auditor enforcing Hard Rule 4."""

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self._llm_client = llm_client or LLMClient()

    async def audit_tailored_resume(
        self,
        original_profile: ParsedProfile,
        tailored: ResumeRewriteLLMOutput,
    ) -> FabricationReport:
        """Execute deterministic audit plus independent LLM factual verification pass."""
        unsupported_claims: list[UnsupportedClaim] = []
        deterministic_checks_count = 0

        # Stage 1: Deterministic Checks
        det_claims, det_count = self._run_deterministic_checks(original_profile, tailored)
        unsupported_claims.extend(det_claims)
        deterministic_checks_count += det_count

        # Stage 2: Independent LLM Factual Claim Verification Pass (Temperature 0)
        llm_claims, llm_count = await self._run_llm_claim_verification(original_profile, tailored)
        unsupported_claims.extend(llm_claims)
        total_claims_checked = deterministic_checks_count + llm_count

        # Deduplicate unsupported claims by claim text (case-insensitive)
        deduped: list[UnsupportedClaim] = []
        seen_texts: set[str] = set()
        for c in unsupported_claims:
            norm = c.text.strip().lower()
            if norm not in seen_texts:
                seen_texts.add(norm)
                deduped.append(c)

        passed = len(deduped) == 0
        return FabricationReport(
            claims_checked=max(total_claims_checked, len(deduped)),
            unsupported_claims=deduped,
            passed=passed,
        )

    def _run_deterministic_checks(
        self,
        original: ParsedProfile,
        tailored: ResumeRewriteLLMOutput,
    ) -> tuple[list[UnsupportedClaim], int]:
        """Perform zero-tolerance deterministic validation against source facts."""
        flags: list[UnsupportedClaim] = []
        checks_count = 0

        # 1. Collect all verified skills and technologies from original profile
        source_skills: set[str] = set()
        for p_skill in original.skills:
            source_skills.update(extract_skills(p_skill.name))
        for orig_exp in original.experience:
            for t in orig_exp.technologies:
                source_skills.update(extract_skills(t))
            for b in orig_exp.bullets:
                source_skills.update(extract_skills(b))
        for proj in original.projects:
            for t in proj.technologies:
                source_skills.update(extract_skills(t))
            source_skills.update(extract_skills(proj.description))
        if original.summary:
            source_skills.update(extract_skills(original.summary))
        for cert in original.certifications:
            source_skills.update(extract_skills(cert.name))

        # Check skills_to_highlight in tailored resume
        for skill_item in tailored.skills_to_highlight:
            checks_count += 1
            extracted = extract_skills(skill_item)
            for skill_str in extracted if extracted else [skill_item]:
                if skill_str not in source_skills:
                    flags.append(
                        UnsupportedClaim(
                            text=f"Invented tool or skill: '{skill_str}'",
                            location="skills_to_highlight",
                            reason=(
                                f"Skill '{skill_str}' does not exist in candidate verified profile."
                            ),
                        )
                    )

        # Check skills extracted from tailored summary and bullets
        tailored_summary_skills = extract_skills(tailored.tailored_summary)
        for skill_str in tailored_summary_skills:
            checks_count += 1
            if skill_str not in source_skills:
                flags.append(
                    UnsupportedClaim(
                        text=f"Invented tool or skill in summary: '{skill_str}'",
                        location="summary",
                        reason=f"Skill '{skill_str}' does not exist in candidate verified profile.",
                    )
                )

        for t_exp_idx, t_exp in enumerate(tailored.experience):
            for t_b_idx, rew_bullet in enumerate(t_exp.bullets):
                bullet_skills = extract_skills(rew_bullet.text)
                for skill_str in bullet_skills:
                    checks_count += 1
                    if skill_str not in source_skills:
                        flags.append(
                            UnsupportedClaim(
                                text=f"Invented tool or skill in bullet: '{skill_str}'",
                                location=f"experience[{t_exp_idx}].bullets[{t_b_idx}]",
                                reason=(
                                    f"Skill '{skill_str}' is absent from candidate verified facts."
                                ),
                            )
                        )

        # 2. Metric and Number Check
        source_text_chunks: list[str] = []
        if original.summary:
            source_text_chunks.append(original.summary)
        for orig_exp in original.experience:
            source_text_chunks.extend(orig_exp.bullets)
        for proj in original.projects:
            source_text_chunks.append(proj.description)

        source_numbers = self._extract_numbers(" ".join(source_text_chunks))

        # Check numbers in tailored summary
        for num in self._extract_numbers(tailored.tailored_summary):
            checks_count += 1
            if not self._is_number_supported(num, source_numbers):
                flags.append(
                    UnsupportedClaim(
                        text=f"Invented metric or number in summary: '{num}'",
                        location="summary",
                        reason=(
                            f"Metric '{num}' does not appear in candidate verified source facts."
                        ),
                    )
                )

        # Check numbers in tailored experience bullets
        for t_exp_idx, t_exp in enumerate(tailored.experience):
            for t_b_idx, rew_bullet in enumerate(t_exp.bullets):
                for num in self._extract_numbers(rew_bullet.text):
                    checks_count += 1
                    if not self._is_number_supported(num, source_numbers):
                        flags.append(
                            UnsupportedClaim(
                                text=f"Invented metric or number: '{num}'",
                                location=f"experience[{t_exp_idx}].bullets[{t_b_idx}]",
                                reason=f"Metric '{num}' is unverified in source profile.",
                            )
                        )

        # 3. Company & Employer Verification
        source_companies = {e.company.strip().lower() for e in original.experience}
        for t_exp_idx, t_exp in enumerate(tailored.experience):
            checks_count += 1
            if t_exp.company.strip().lower() not in source_companies:
                flags.append(
                    UnsupportedClaim(
                        text=f"Invented company or employer: '{t_exp.company}'",
                        location=f"experience[{t_exp_idx}].company",
                        reason=f"Company '{t_exp.company}' is not in candidate employment history.",
                    )
                )

        # 4. Dates Check
        source_dates_by_comp = {
            e.company.strip().lower(): (e.start.strip(), (e.end or "").strip())
            for e in original.experience
        }
        for t_exp_idx, t_exp in enumerate(tailored.experience):
            checks_count += 1
            comp_key = t_exp.company.strip().lower()
            if comp_key in source_dates_by_comp:
                src_start, src_end = source_dates_by_comp[comp_key]
                t_start = t_exp.start.strip()
                t_end = (t_exp.end or "").strip()
                if t_start != src_start or t_end != src_end:
                    flags.append(
                        UnsupportedClaim(
                            text=f"Modified dates for '{t_exp.company}': '{t_start} - {t_end}'",
                            location=f"experience[{t_exp_idx}].dates",
                            reason=f"Dates differ from source ({src_start} - {src_end}).",
                        )
                    )

        return flags, checks_count

    async def _run_llm_claim_verification(
        self,
        original: ParsedProfile,
        tailored: ResumeRewriteLLMOutput,
    ) -> tuple[list[UnsupportedClaim], int]:
        """Invoke independent LLM pass at temperature 0.0 to audit factual claims."""
        original_summary = (
            f"Name: {original.name}\n"
            f"Summary: {original.summary}\n"
            f"Skills: {', '.join(s.name for s in original.skills)}\n"
            f"Experience:\n"
            + "\n".join(
                f"- {e.title} at {e.company} ({e.start} - {e.end or 'Present'}):\n  "
                + "\n  ".join(e.bullets)
                for e in original.experience
            )
            + "\nProjects:\n"
            + "\n".join(f"- {p.name}: {p.description}" for p in original.projects)
        )

        tailored_summary = (
            f"Tailored Summary: {tailored.tailored_summary}\n"
            f"Skills to Highlight: {', '.join(tailored.skills_to_highlight)}\n"
            f"Tailored Experience:\n"
            + "\n".join(
                f"- {e.title} at {e.company} ({e.start} - {e.end or 'Present'}):\n  "
                + "\n  ".join(f"[{b.source_fact_ref}] {b.text}" for b in e.bullets)
                for e in tailored.experience
            )
            + "\nTailored Projects:\n"
            + "\n".join(f"- {p.name}: {p.description}" for p in tailored.projects)
        )

        variables = {
            "original_profile_data": wrap_untrusted("source_profile", original_summary),
            "tailored_resume_data": wrap_untrusted("tailored_resume", tailored_summary),
        }

        try:
            audit_result = await self._llm_client.generate_structured(
                prompt_template=f"{AUDIT_SYSTEM_PROMPT}\n\n{AUDIT_USER_TEMPLATE}",
                variables=variables,
                output_model=FabricationAuditLLMOutput,
                temperature=0.0,
                task_name="fabrication_audit_agent",
            )

            unsupported: list[UnsupportedClaim] = []
            for claim in audit_result.claims:
                if not claim.is_supported:
                    unsupported.append(
                        UnsupportedClaim(
                            text=claim.claim_text,
                            location=claim.location,
                            reason=claim.unsupported_reason or "Unsupported by source profile",
                        )
                    )
            return unsupported, audit_result.claims_checked

        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "LLM fabrication audit pass failed (%s); relying on deterministic checks.", exc
            )
            return [], 0

    @staticmethod
    def _extract_numbers(text: str) -> set[str]:
        """Extract canonical number and metric representations."""
        raw_matches = NUMBER_PATTERN.findall(text)
        cleaned: set[str] = set()
        for m in raw_matches:
            c = m.lower().replace(",", "").replace("$", "").replace("€", "").replace("£", "")
            if c:
                cleaned.add(c)
        return cleaned

    @staticmethod
    def _is_number_supported(num: str, source_numbers: set[str]) -> bool:
        """Check if number/metric or an equivalent format exists in source numbers."""
        if num in source_numbers:
            return True
        # Convert k / 1000 equivalents (e.g. 10k -> 10000)
        if num.endswith("k"):
            try:
                val = float(num[:-1]) * 1000
                if str(int(val)) in source_numbers:
                    return True
            except ValueError:
                pass
        return False
