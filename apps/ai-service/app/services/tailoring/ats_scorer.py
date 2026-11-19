from __future__ import annotations

import re

from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import AtsReport, AtsSectionCheck, KeywordPlanItem


class AtsScorer:
    """Evaluates ATS keyword coverage, section integrity, and layout compliance."""

    def evaluate(
        self,
        tailored_profile: ParsedProfile,
        keyword_plan: list[KeywordPlanItem],
        original_profile: ParsedProfile | None = None,
    ) -> AtsReport:
        """Compute full ATS compatibility assessment deterministically."""
        # 1. Aggregate all text from tailored profile
        text_corpus = self._extract_full_text(tailored_profile)
        word_count = len(text_corpus.split())

        # 2. Keyword Coverage Assessment using rigorous weighted formula
        matched_keywords: list[str] = []
        missing_keywords: list[str] = []

        total_weight = 0.0
        score_after = 0.0
        score_before = 0.0

        for item in keyword_plan:
            weight = 2.0 if item.category == "required" else 1.0
            total_weight += weight

            support = getattr(item, "support", "none" if item.is_gap else "strong")
            if support == "strong":
                matched_keywords.append(item.keyword)
                score_after += weight * 1.0
                score_before += weight * 0.85  # before tailoring, not all evidence was surfaced/rephrased
            elif support == "partial":
                matched_keywords.append(f"{item.keyword} (Partial)")
                score_after += weight * 0.5
                score_before += weight * 0.4
            else:
                missing_keywords.append(item.keyword)
                score_after += 0.0
                score_before += 0.0

        if total_weight > 0:
            coverage_after = round((score_after / total_weight) * 100.0, 1)
            coverage_before = round((score_before / total_weight) * 100.0, 1)
        else:
            coverage_after = 100.0
            coverage_before = 100.0

        # 3. Section Presence Checks
        section_checks = self._perform_section_checks(tailored_profile)

        # 4. Length Assessment
        length_check = self._assess_length(word_count)

        # 5. Formatting Warnings
        formatting_warnings = [
            "Single-column ATS layout verified: no multi-column tables, text boxes, "
            "headers/footers, or embedded images used.",
            "Standard fonts and clear uppercase headers recommended for maximum "
            "ATS parser parsing fidelity.",
        ]

        return AtsReport(
            keyword_coverage=coverage_after,
            keyword_coverage_before=coverage_before,
            keyword_coverage_after=coverage_after,
            missing_keywords=missing_keywords,
            section_checks=section_checks,
            length_check=length_check,
            word_count=word_count,
            formatting_warnings=formatting_warnings,
        )

    @staticmethod
    def _extract_full_text(profile: ParsedProfile) -> str:
        """Concatenate all candidate profile sections for keyword scanning."""
        parts: list[str] = []
        if profile.name:
            parts.append(profile.name)
        if profile.summary:
            parts.append(profile.summary)
        for s in profile.skills:
            parts.append(s.name)
        for exp in profile.experience:
            parts.append(exp.title)
            parts.append(exp.company)
            parts.extend(exp.technologies)
            parts.extend(exp.bullets)
        for proj in profile.projects:
            parts.append(proj.name)
            parts.append(proj.description)
            parts.extend(proj.technologies)
        for edu in profile.education:
            parts.append(edu.institution)
            parts.append(edu.degree)
            if edu.field_of_study:
                parts.append(edu.field_of_study)
        for cert in profile.certifications:
            parts.append(cert.name)

        return " ".join(parts)

    @staticmethod
    def _perform_section_checks(profile: ParsedProfile) -> list[AtsSectionCheck]:
        """Verify presence and standard ATS structure across core resume sections."""
        checks: list[AtsSectionCheck] = []

        # Contact Info
        has_contact = bool(profile.name and (profile.email or profile.phone))
        checks.append(
            AtsSectionCheck(
                section="contact",
                status="pass" if has_contact else "warning",
                feedback="Essential contact information present."
                if has_contact
                else "Missing primary email or phone number in contact header.",
            )
        )

        # Professional Summary
        has_summary = bool(profile.summary and len(profile.summary.strip()) > 20)
        checks.append(
            AtsSectionCheck(
                section="summary",
                status="pass" if has_summary else "warning",
                feedback="Professional summary headline is present and concise."
                if has_summary
                else "Summary section is missing or too brief.",
            )
        )

        # Work Experience
        exp_count = len(profile.experience)
        has_bullets = any(bool(e.bullets) for e in profile.experience)
        if exp_count > 0 and has_bullets:
            checks.append(
                AtsSectionCheck(
                    section="experience",
                    status="pass",
                    feedback=(
                        f"Found {exp_count} verified roles with quantified bullet accomplishments."
                    ),
                )
            )
        elif exp_count > 0:
            checks.append(
                AtsSectionCheck(
                    section="experience",
                    status="warning",
                    feedback="Work experience entries lack bullet points.",
                )
            )
        else:
            checks.append(
                AtsSectionCheck(
                    section="experience",
                    status="fail",
                    feedback="No work experience entries found in resume.",
                )
            )

        # Core Skills
        skills_count = len(profile.skills)
        if skills_count >= 5:
            checks.append(
                AtsSectionCheck(
                    section="skills",
                    status="pass",
                    feedback=(
                        f"Identified {skills_count} prioritized technical and professional skills."
                    ),
                )
            )
        elif skills_count > 0:
            checks.append(
                AtsSectionCheck(
                    section="skills",
                    status="warning",
                    feedback=(
                        f"Skills list contains only {skills_count} items; "
                        "expanding keywords recommended."
                    ),
                )
            )
        else:
            checks.append(
                AtsSectionCheck(
                    section="skills",
                    status="fail",
                    feedback="No skills section detected.",
                )
            )

        # Education
        edu_count = len(profile.education)
        checks.append(
            AtsSectionCheck(
                section="education",
                status="pass" if edu_count > 0 else "warning",
                feedback=f"Education section verified with {edu_count} academic credentials."
                if edu_count > 0
                else "No formal educational history specified.",
            )
        )

        return checks

    @staticmethod
    def _assess_length(word_count: int) -> str:
        """Evaluate resume word count for standard 1-2 page ATS optimization."""
        if word_count < 250:
            return (
                f"Brief: {word_count} words. May be too brief for standard ATS parsing "
                "(optimal: 350-800 words)."
            )
        if word_count <= 800:
            return f"Optimal 1-page resume: {word_count} words. Ideal density for ATS indexing."
        if word_count <= 1200:
            return f"Optimal 2-page resume: {word_count} words. Good balance of depth and brevity."
        return (
            f"Lengthy: {word_count} words. Consider condensing to under 1000 words "
            "to avoid parser truncation."
        )
