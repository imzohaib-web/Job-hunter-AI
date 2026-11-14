from __future__ import annotations

import re
from typing import Final

from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import KeywordPlanItem
from app.services.job_sources.skill_extractor import SKILL_TAXONOMY, extract_skills

REQUIRED_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"\b(required|requirements|must have|minimum qualifications|qualifications|essential)\b",
    re.IGNORECASE,
)
PREFERRED_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"\b(preferred|nice to have|bonus|plus|desired|optional|good to have)\b",
    re.IGNORECASE,
)


class KeywordPlanner:
    """Extracts job keywords, maps them to verified profile facts, and isolates gaps."""

    def __init__(self) -> None:
        # Precompile lookup mapping: canonical skill -> list of regex patterns
        self._patterns: dict[str, list[re.Pattern[str]]] = {}
        for canonical, aliases in SKILL_TAXONOMY.items():
            patterns = [re.compile(rf"\b{re.escape(canonical)}\b", re.IGNORECASE)]
            for alias in aliases:
                patterns.append(re.compile(rf"\b{re.escape(alias)}\b", re.IGNORECASE))
            self._patterns[canonical] = patterns

    def build_plan(
        self,
        profile: ParsedProfile,
        job: JobPosting,
    ) -> list[KeywordPlanItem]:
        """Extract job keywords and cross-reference with candidate profile evidence."""
        target_keywords = self._extract_job_keywords(job)
        plan_items: list[KeywordPlanItem] = []

        for kw, category in target_keywords.items():
            evidence = self._find_profile_evidence(kw, profile)
            if evidence:
                plan_items.append(
                    KeywordPlanItem(
                        keyword=kw,
                        category=category,
                        evidence=evidence,
                        is_gap=False,
                    )
                )
            else:
                plan_items.append(
                    KeywordPlanItem(
                        keyword=kw,
                        category=category,
                        evidence=None,
                        is_gap=True,
                    )
                )

        return plan_items

    def _extract_job_keywords(self, job: JobPosting) -> dict[str, str]:
        """Collect all canonical keywords required or preferred by the job."""
        keywords: dict[str, str] = {}

        # 1. Explicitly required skills
        for s in job.skills_required:
            extracted = extract_skills(s)
            for skill in extracted if extracted else [s.strip()]:
                if skill:
                    keywords[skill] = "required"

        # 2. Extract from description, honoring required vs preferred sections
        current_section = "required"
        for line in job.description.splitlines():
            clean = line.strip()
            if not clean:
                continue
            if REQUIRED_PATTERN.search(clean) and (":" in clean or len(clean) < 60):
                current_section = "required"
            elif PREFERRED_PATTERN.search(clean) and (":" in clean or len(clean) < 60):
                current_section = "preferred"

            line_skills = extract_skills(clean)
            for s in line_skills:
                # Keep 'required' if previously marked required
                if s not in keywords or keywords[s] == "preferred":
                    keywords[s] = current_section

        return keywords

    def _find_profile_evidence(self, keyword: str, profile: ParsedProfile) -> str | None:
        """Search profile for direct evidence of this keyword."""
        patterns = self._patterns.get(
            keyword,
            [re.compile(rf"\b{re.escape(keyword)}\b", re.IGNORECASE)],
        )

        def matches_any(text: str) -> bool:
            return any(pat.search(text) for pat in patterns)

        # 1. Check explicit profile skills
        for idx, s in enumerate(profile.skills):
            if matches_any(s.name) or (s.evidence and matches_any(s.evidence)):
                return f"profile.skills[{idx}] ({s.name})"

        # 2. Check experience technologies & bullets
        for exp_idx, exp in enumerate(profile.experience):
            for t in exp.technologies:
                if matches_any(t):
                    return f"profile.experience[{exp_idx}].technologies ({t})"
            for b_idx, bullet in enumerate(exp.bullets):
                if matches_any(bullet):
                    return f"profile.experience[{exp_idx}].bullets[{b_idx}]"

        # 3. Check projects
        for proj_idx, proj in enumerate(profile.projects):
            for t in proj.technologies:
                if matches_any(t):
                    return f"profile.projects[{proj_idx}].technologies ({t})"
            if matches_any(proj.description):
                return f"profile.projects[{proj_idx}].description"

        # 4. Check summary
        if profile.summary and matches_any(profile.summary):
            return "profile.summary"

        # 5. Check certifications
        for cert_idx, cert in enumerate(profile.certifications):
            if matches_any(cert.name):
                return f"profile.certifications[{cert_idx}] ({cert.name})"

        # 6. Check education
        for edu_idx, edu in enumerate(profile.education):
            if edu.field_of_study and matches_any(edu.field_of_study):
                return f"profile.education[{edu_idx}].field_of_study ({edu.field_of_study})"

        return None
