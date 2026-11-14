from __future__ import annotations

import re
from datetime import UTC, datetime

from app.schemas.job import JobPosting
from app.schemas.match import CandidatePreferences
from app.schemas.profile import ParsedProfile
from app.services.job_sources.cleaner import normalize_company

# Patterns for years of experience
YEARS_EXP_RE = re.compile(
    r"\b(\d{1,2})\+?\s*(?:to\s*\d{1,2}\s*)?(?:-\s*\d{1,2}\s*)?years?(?:\s+of)?(?:\s+relevant|\s+professional|\s+work)?\s+experience\b",
    re.IGNORECASE,
)

# Patterns for strict work authorization requirements
NO_SPONSORSHIP_PATTERNS = [
    re.compile(r"\bno\s+sponsorship\b", re.IGNORECASE),
    re.compile(r"\bno\s+visa\s+sponsorship\b", re.IGNORECASE),
    re.compile(r"\b(?:must|required\s+to)\s+be\s+a\s+(?:us|u\.s\.)\s+citizen\b", re.IGNORECASE),
    re.compile(r"\bsecurity\s+clearance\s+required\b", re.IGNORECASE),
    re.compile(r"\bwithout\s+(?:the\s+need\s+for\s+)?(?:visa\s+)?sponsorship\b", re.IGNORECASE),
    re.compile(r"\bnot\s+offering\s+sponsorship\b", re.IGNORECASE),
]

SENIORITY_YEARS_MAP: dict[str, float] = {
    "entry": 0.5,
    "junior": 1.5,
    "mid": 3.0,
    "senior": 5.0,
    "lead": 7.0,
    "staff": 8.0,
    "principal": 10.0,
}


def _parse_year_month(date_str: str | None) -> float | None:
    if not date_str:
        return None
    cleaned = date_str.strip().lower()
    if cleaned in ("present", "current", "now"):
        now = datetime.now(UTC)
        return float(now.year + (now.month / 12.0))

    match = re.search(r"(\d{4})(?:[-/](\d{1,2}))?", cleaned)
    if not match:
        return None

    year = float(match.group(1))
    month = float(match.group(2)) if match.group(2) else 6.0
    return year + (month / 12.0)


def calculate_candidate_years_experience(profile: ParsedProfile) -> float:
    """Estimate total professional experience from work history and skill durations."""
    total_years = 0.0

    if profile.experience:
        for exp in profile.experience:
            start_val = _parse_year_month(exp.start)
            end_val = _parse_year_month(exp.end)
            if start_val is not None:
                if end_val is not None and end_val >= start_val:
                    total_years += max(0.2, end_val - start_val)
                else:
                    total_years += 1.5  # default estimate per entry
            else:
                total_years += 1.5

    # Cross-reference with maximum years listed on any skill
    skill_max = 0.0
    for s in profile.skills:
        if s.years and s.years > skill_max:
            skill_max = s.years

    return max(total_years, skill_max, 1.0 if profile.experience else 0.5)


def extract_job_required_years(job: JobPosting) -> float:
    """Extract required minimum years of experience from description or seniority."""
    match = YEARS_EXP_RE.search(job.description)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            pass

    return SENIORITY_YEARS_MAP.get(job.seniority.lower(), 3.0)


def evaluate_hard_filters(
    job: JobPosting,
    profile: ParsedProfile,
    prefs: CandidatePreferences,
) -> tuple[bool, str | None]:
    """Evaluate deterministic hard filter constraints.

    Returns:
        (failed: bool, reason: str | None)
    """
    # 1. Excluded companies
    norm_company = normalize_company(job.company)
    for excluded in prefs.excluded_companies:
        if norm_company and normalize_company(excluded) in norm_company:
            return True, f"Company '{job.company}' is in candidate excluded list."

    # 2. Excluded keywords in title or description
    check_corpus = f"{job.title} {job.description[:300]}".lower()
    for kw in prefs.excluded_keywords:
        if kw.strip() and kw.strip().lower() in check_corpus:
            return True, f"Job matches candidate excluded keyword '{kw.strip()}'."

    # 3. Location / Remote preference
    job_loc_lower = job.location.lower()
    is_job_remote = (
        job.remote is True
        or "remote" in job_loc_lower
        or "anywhere" in job_loc_lower
        or "remote" in job.title.lower()
    )

    if prefs.remote_only and not is_job_remote:
        return True, "Role is not remote; candidate requires fully remote position."

    if prefs.location:
        cand_loc = prefs.location.lower().strip()
        if not is_job_remote and cand_loc not in job_loc_lower:
            return True, f"Job location '{job.location}' does not match '{prefs.location}'."

    # 4. Work authorization
    if prefs.work_authorization:
        auth_lower = prefs.work_authorization.lower()
        needs_sponsorship = any(
            t in auth_lower for t in ("sponsor", "visa", "opt", "h1b", "require")
        )
        if needs_sponsorship:
            for pat in NO_SPONSORSHIP_PATTERNS:
                if pat.search(job.description):
                    return True, "Role requires US work authorization without visa sponsorship."

    # 5. Experience gap beyond tolerance
    candidate_years = calculate_candidate_years_experience(profile)
    required_years = extract_job_required_years(job)
    gap = required_years - candidate_years
    tolerance = prefs.experience_gap_tolerance_years

    if gap > tolerance:
        return True, (
            f"Requires {required_years:.0f} years of experience, exceeding candidate's "
            f"{candidate_years:.1f} years beyond tolerance of {tolerance:.1f} years."
        )

    return False, None
