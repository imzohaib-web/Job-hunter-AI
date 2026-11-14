from __future__ import annotations

import re
from dataclasses import dataclass

from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile
from app.services.job_sources.skill_extractor import extract_skills

REQUIRED_PATTERN = re.compile(
    r"\b(required|must have|requirements|minimum qualifications|what you(?:'ll|\s+will)? need)\b",
    re.IGNORECASE,
)
PREFERRED_PATTERN = re.compile(
    r"\b(nice to have|preferred|bonus|plus|optional|good to have)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class SkillMatchEvaluation:
    score: float
    matched_skills: list[str]
    missing_skills: list[str]


def collect_candidate_skills(profile: ParsedProfile) -> set[str]:
    """Gather all canonical candidate skills from profile fields."""
    skills_found: set[str] = set()

    for ps in profile.skills:
        extracted = extract_skills(ps.name)
        skills_found.update(extracted if extracted else [ps.name])

    for exp in profile.experience:
        for tech in exp.technologies:
            extracted = extract_skills(tech)
            skills_found.update(extracted if extracted else [tech])

    for proj in profile.projects:
        for tech in proj.technologies:
            extracted = extract_skills(tech)
            skills_found.update(extracted if extracted else [tech])

    if profile.summary:
        skills_found.update(extract_skills(profile.summary))

    return skills_found


def _determine_skill_weight(skill: str, description: str) -> float:
    """Determine whether skill is required (1.5), nice-to-have (0.75), or standard (1.0)."""
    current_section = "standard"
    escaped = re.escape(skill)
    skill_pat = re.compile(rf"\b{escaped}\b", re.IGNORECASE)

    for line in description.splitlines():
        line_clean = line.strip()
        if not line_clean:
            continue
        if REQUIRED_PATTERN.search(line_clean) and (":" in line_clean or len(line_clean) < 60):
            current_section = "required"
        elif PREFERRED_PATTERN.search(line_clean) and (":" in line_clean or len(line_clean) < 60):
            current_section = "preferred"

        if skill_pat.search(line_clean):
            if PREFERRED_PATTERN.search(line_clean):
                return 0.75
            if REQUIRED_PATTERN.search(line_clean):
                return 1.5
            if current_section == "required":
                return 1.5
            if current_section == "preferred":
                return 0.75

    return 1.0


def evaluate_skill_overlap(
    job: JobPosting,
    candidate_skills: set[str],
) -> SkillMatchEvaluation:
    """Evaluate matched vs missing skills with weighted importance."""
    # Combine job required skills and extracted skills from description
    job_skills_set: set[str] = set()
    for s in job.skills_required:
        extracted = extract_skills(s)
        job_skills_set.update(extracted if extracted else [s])

    extracted_from_desc = extract_skills(job.description)
    job_skills_set.update(extracted_from_desc)

    if not job_skills_set:
        return SkillMatchEvaluation(
            score=85.0,
            matched_skills=[],
            missing_skills=[],
        )

    matched: list[str] = []
    missing: list[str] = []
    total_weight = 0.0
    matched_weight = 0.0

    for skill in sorted(job_skills_set):
        weight = _determine_skill_weight(skill, job.description)
        total_weight += weight
        if skill in candidate_skills:
            matched.append(skill)
            matched_weight += weight
        else:
            missing.append(skill)

    score = (matched_weight / total_weight) * 100.0 if total_weight > 0.0 else 100.0
    return SkillMatchEvaluation(
        score=round(min(100.0, max(0.0, score)), 2),
        matched_skills=matched,
        missing_skills=missing,
    )
