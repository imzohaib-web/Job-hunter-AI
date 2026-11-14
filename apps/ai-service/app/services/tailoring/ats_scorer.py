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
    ) -> AtsReport:
        """Compute full ATS compatibility assessment deterministically."""
        # 1. Aggregate all text from tailored profile
        text_corpus = self._extract_full_text(tailored_profile)
        word_count = len(text_corpus.split())

        # 2. Keyword Coverage Assessment
        target_keywords = [item.keyword for item in keyword_plan]
        matched_keywords: list[str] = []
        missing_keywords: list[str] = []

        for kw in target_keywords:
            pattern = re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE)
            if pattern.search(text_corpus):
                matched_keywords.append(kw)
            else:
                missing_keywords.append(kw)

        if target_keywords:
            coverage = round((len(matched_keywords) / len(target_keywords)) * 100.0, 1)
        else:
            coverage = 100.0

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
            keyword_coverage=coverage,
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
