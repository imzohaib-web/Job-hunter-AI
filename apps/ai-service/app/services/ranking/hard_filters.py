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

    Hard filters apply ONLY to:
    - Excluded companies
    - Excluded keywords
    - Criteria explicitly set and marked 'required' by user
    Everything else is a soft preference evaluated in evaluate_soft_preferences.
    """
    req_fields = set(prefs.required_fields)

    # 1. Excluded companies (always hard filter)
    norm_company = normalize_company(job.company)
    for excluded in prefs.excluded_companies:
        if norm_company and normalize_company(excluded) in norm_company:
            return True, f"Company '{job.company}' is in candidate excluded list."

    # 2. Excluded keywords in title or description (always hard filter)
    check_corpus = f"{job.title} {job.description[:400]}".lower()
    for kw in prefs.excluded_keywords:
        kw_clean = kw.strip().lower()
        if kw_clean and re.search(r"\b" + re.escape(kw_clean) + r"\b", check_corpus):
            return True, f"Job matches candidate excluded keyword '{kw.strip()}'."

    # 3. Explicitly required: Remote only
    job_loc_lower = job.location.lower()
    is_job_remote = (
        job.remote is True
        or "remote" in job_loc_lower
        or "anywhere" in job_loc_lower
        or "remote" in job.title.lower()
    )
    if "remote_only" in req_fields and prefs.remote_only and not is_job_remote:
        return True, "Role is not remote; candidate marked remote-only as strictly required."

    # 4. Explicitly required: Location
    if "location" in req_fields and prefs.location and not is_job_remote:
        cand_loc = prefs.location.lower().strip()
        if cand_loc not in job_loc_lower:
            return True, f"Job location '{job.location}' does not match required '{prefs.location}'."

    # 5. Explicitly required: Work authorization without sponsorship
    if "work_authorization" in req_fields and prefs.work_authorization:
        auth_lower = prefs.work_authorization.lower()
        needs_sponsorship = any(
            t in auth_lower for t in ("sponsor", "visa", "opt", "h1b", "require")
        )
        if needs_sponsorship:
            for pat in NO_SPONSORSHIP_PATTERNS:
                if pat.search(job.description):
                    return True, "Role strictly requires US work authorization without visa sponsorship."

    return False, None


def infer_candidate_level(profile: ParsedProfile, prefs: CandidatePreferences) -> str:
    """Infers candidate seniority level ('junior', 'mid', 'senior') from profile and preferences."""
    cand_levels = [lvl.lower().strip() for lvl in (prefs.experience_levels or []) if lvl.strip()]
    if any(l in ("junior", "entry", "internship", "intern") for l in cand_levels):
        return "junior"
    if any(l in ("senior", "lead", "staff", "principal", "director") for l in cand_levels):
        return "senior"

    years = calculate_candidate_years_experience(profile)
    summary_and_titles = f"{profile.summary} {' '.join(e.title for e in profile.experience)}".lower()
    if "intern" in summary_and_titles or "junior" in summary_and_titles or years < 2.0:
        return "junior"
    if years >= 5.0 or "senior" in summary_and_titles or "lead" in summary_and_titles:
        return "senior"
    return "mid"


def evaluate_soft_preferences(
    job: JobPosting,
    profile: ParsedProfile,
    prefs: CandidatePreferences,
) -> tuple[int, list[str]]:
    """Evaluates soft preference mismatches and returns (net_adjustment: int, reasons: list[str])."""
    adjustments: list[int] = []
    reasons: list[str] = []

    title_desc = f"{job.title} {job.description}".lower()
    job_loc_lower = job.location.lower()
    job_title_lower = job.title.lower()
    is_job_remote = (
        job.remote is True
        or "remote" in job_loc_lower
        or "anywhere" in job_loc_lower
        or "worldwide" in job_loc_lower
        or "remote" in job_title_lower
    )

    cand_level = infer_candidate_level(profile, prefs)

    # 1. Seniority gap / bonus evaluation
    is_senior_job = any(
        k in job_title_lower
        for k in ["senior", "sr.", "lead", "staff", "principal", "director", "head of", "architect"]
    )
    is_junior_job = any(
        k in job_title_lower
        for k in [
            "junior", "jr.", "entry", "entry-level", "intern", "internship",
            "trainee", "associate", "graduate", "fresher", "apprentice",
        ]
    )

    if cand_level == "junior":
        if is_senior_job:
            adjustments.append(-25)
            reasons.append("Senior role, above your level")
        elif is_junior_job:
            adjustments.append(10)
            reasons.append("Junior/internship role, matches your level")
    elif cand_level == "senior":
        if is_junior_job:
            adjustments.append(-15)
            reasons.append("Entry role, you prefer senior")

    # 2. Employment type mismatch (-10)
    if prefs.employment_types:
        cand_types = [t.lower().strip() for t in prefs.employment_types if t.strip()]
        job_type = (job.employment_type or "").lower()

        has_fulltime_pref = any(t in ("full-time", "full_time") for t in cand_types)
        is_contract = "contract" in job_type or "contract" in title_desc or "freelance" in job_type
        is_parttime = "part-time" in job_type or "part time" in title_desc

        if has_fulltime_pref and (is_contract or is_parttime):
            tag = "Contract" if is_contract else "Part-time"
            adjustments.append(-10)
            reasons.append(f"{tag} role, you prefer full-time")

    # 3. Location & Country restriction mismatch (-20)
    # Remote jobs restricted to specific countries not containing candidate's country get -20
    country_restrictions = [
        ("usa, canada", "Remote, but restricted to USA/Canada"),
        ("us only", "Remote, but restricted to USA"),
        ("usa only", "Remote, but restricted to USA"),
        ("united states only", "Remote, but restricted to USA"),
        ("uk only", "Remote, but restricted to UK"),
        ("germany only", "Remote, but restricted to Germany"),
        ("canada only", "Remote, but restricted to Canada"),
        ("eu only", "Remote, but restricted to Europe"),
        ("europe only", "Remote, but restricted to Europe"),
    ]
    matched_restriction_note = None
    for pattern, note in country_restrictions:
        if pattern in job_loc_lower or pattern in title_desc[:400]:
            matched_restriction_note = note
            break

    if matched_restriction_note:
        adjustments.append(-20)
        reasons.append(matched_restriction_note)
    elif prefs.remote_only and not is_job_remote:
        adjustments.append(-10)
        reasons.append("On-site role, you prefer remote")

    # 4. Salary minimum mismatch (-10)
    if prefs.salary_min and prefs.salary_min > 0:
        if job.salary_max is not None and job.salary_max < prefs.salary_min:
            adjustments.append(-10)
            reasons.append("Disclosed salary below your minimum target")

    # Sum adjustments (penalties capped at -35, bonuses allowed)
    net_val = sum(adjustments)
    final_adjustment = max(-35, min(20, net_val))
    return final_adjustment, reasons
    return total_penalty, reasons
