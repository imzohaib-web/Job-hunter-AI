from __future__ import annotations

import re

from app.schemas.profile import ParsedProfile, ProfileSkill

SKILL_ALIAS_MAP: dict[str, str] = {
    "js": "JavaScript",
    "javascript": "JavaScript",
    "ts": "TypeScript",
    "typescript": "TypeScript",
    "py": "Python",
    "python": "Python",
    "node": "Node.js",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "react": "React",
    "reactjs": "React",
    "react.js": "React",
    "vue": "Vue.js",
    "vuejs": "Vue.js",
    "vue.js": "Vue.js",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "mongo": "MongoDB",
    "mongodb": "MongoDB",
    "k8s": "Kubernetes",
    "kubernetes": "Kubernetes",
    "docker": "Docker",
    "aws": "Amazon Web Services (AWS)",
    "amazon web services": "Amazon Web Services (AWS)",
    "gcp": "Google Cloud Platform (GCP)",
    "google cloud": "Google Cloud Platform (GCP)",
    "azure": "Microsoft Azure",
    "golang": "Go",
    "go": "Go",
    "tf": "Terraform",
    "terraform": "Terraform",
    "graphql": "GraphQL",
    "rest": "REST APIs",
    "restful": "REST APIs",
    "rest api": "REST APIs",
    "ci/cd": "CI/CD",
    "cicd": "CI/CD",
    "git": "Git",
    "github": "GitHub",
    "gitlab": "GitLab",
    "fastapi": "FastAPI",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "langchain": "LangChain",
    "langgraph": "LangGraph",
}

MONTH_MAP: dict[str, str] = {
    "jan": "01",
    "january": "01",
    "feb": "02",
    "february": "02",
    "mar": "03",
    "march": "03",
    "apr": "04",
    "april": "04",
    "may": "05",
    "jun": "06",
    "june": "06",
    "jul": "07",
    "july": "07",
    "aug": "08",
    "august": "08",
    "sep": "09",
    "september": "09",
    "oct": "10",
    "october": "10",
    "nov": "11",
    "november": "11",
    "dec": "12",
    "december": "12",
}


def normalize_date_string(date_str: str | None) -> str | None:
    """Normalize date strings into standard 'YYYY-MM', 'YYYY', or 'Present'."""
    if not date_str:
        return None

    cleaned = date_str.strip()
    if re.search(r"\b(present|current|now|ongoing)\b", cleaned, re.IGNORECASE):
        return "Present"

    # Match Month YYYY (e.g. "January 2022" or "Jan 2022")
    m_match = re.search(r"([A-Za-z]+)\.?\s+(\d{4})", cleaned)
    if m_match:
        month_word = m_match.group(1).lower()
        year = m_match.group(2)
        month_num = MONTH_MAP.get(month_word)
        if month_num:
            return f"{year}-{month_num}"

    # Match MM/YYYY or MM-YYYY
    slash_match = re.search(r"(\d{1,2})[/\-](\d{4})", cleaned)
    if slash_match:
        m = int(slash_match.group(1))
        y = slash_match.group(2)
        if 1 <= m <= 12:
            return f"{y}-{m:02d}"

    # Match YYYY-MM
    iso_match = re.search(r"(\d{4})[-/](\d{1,2})", cleaned)
    if iso_match:
        y = iso_match.group(1)
        m = int(iso_match.group(2))
        if 1 <= m <= 12:
            return f"{y}-{m:02d}"

    # Match 4-digit year only
    year_match = re.search(r"\b(19\d{2}|20\d{2})\b", cleaned)
    if year_match:
        return year_match.group(1)

    return cleaned


def canonicalize_skill(skill_name: str) -> str:
    """Map skill to canonical alias if available."""
    normalized = skill_name.strip().lower()
    return SKILL_ALIAS_MAP.get(normalized, skill_name.strip())


def deduplicate_skills(skills: list[ProfileSkill]) -> list[ProfileSkill]:
    """Deduplicate skills using alias map, preserving highest years and best evidence."""
    deduped: dict[str, ProfileSkill] = {}

    for s in skills:
        canon_name = canonicalize_skill(s.name)
        key = canon_name.lower()

        if key not in deduped:
            deduped[key] = ProfileSkill(
                name=canon_name,
                category=s.category or "Technical",
                years=s.years,
                evidence=s.evidence,
            )
        else:
            existing = deduped[key]
            # Keep max years
            max_years = None
            if existing.years is not None and s.years is not None:
                max_years = max(existing.years, s.years)
            elif existing.years is not None:
                max_years = existing.years
            elif s.years is not None:
                max_years = s.years

            # Keep longest evidence
            evidence = existing.evidence or s.evidence
            if existing.evidence and s.evidence and len(s.evidence) > len(existing.evidence):
                evidence = s.evidence

            deduped[key] = ProfileSkill(
                name=canon_name,
                category=existing.category or s.category,
                years=max_years,
                evidence=evidence,
            )

    return list(deduped.values())


def validate_contact_info(
    email: str | None,
    phone: str | None,
    links: list[str],
) -> tuple[str | None, str | None, list[str]]:
    """Validate email, phone, and URLs using strict regex."""
    clean_email: str | None = None
    if email:
        email_clean = email.strip().lower()
        if re.match(r"^[\w.+-]+@[\w-]+\.[\w.-]+$", email_clean):
            clean_email = email_clean

    clean_phone: str | None = None
    if phone:
        digits_only = re.sub(r"[^\d+]", "", phone.strip())
        if len(digits_only) >= 7:
            clean_phone = phone.strip()

    clean_links: list[str] = []
    for link in links:
        l_str = link.strip()
        if not l_str.startswith("http://") and not l_str.startswith("https://"):
            l_str = f"https://{l_str}"
        if re.match(r"^https?://[a-zA-Z0-9\-.]+\.[a-zA-Z]{2,}(/.*)?$", l_str):
            clean_links.append(l_str)

    return clean_email, clean_phone, clean_links


def compute_field_confidences(profile: ParsedProfile, raw_text: str) -> dict[str, float]:
    """Compute extraction confidence per field based on textual grounding."""
    confidences: dict[str, float] = {}
    raw_lower = raw_text.lower()

    # 1. Name
    if profile.name and len(profile.name.strip()) > 1:
        # Check if name appears in first 1000 characters
        if profile.name.lower() in raw_lower[:1000]:
            confidences["name"] = 0.98
        elif profile.name.lower() in raw_lower:
            confidences["name"] = 0.90
        else:
            confidences["name"] = 0.45
    else:
        confidences["name"] = 0.0

    # 2. Email
    if profile.email and profile.email.lower() in raw_lower:
        confidences["email"] = 0.99
    elif profile.email:
        confidences["email"] = 0.50
    else:
        confidences["email"] = 0.0

    # 3. Phone
    if profile.phone:
        digits = re.sub(r"[^\d]", "", profile.phone)
        raw_digits = re.sub(r"[^\d]", "", raw_text)
        if digits and digits in raw_digits:
            confidences["phone"] = 0.95
        else:
            confidences["phone"] = 0.60
    else:
        confidences["phone"] = 0.0

    # 4. Location
    loc_parts = (
        [part.strip().lower() for part in profile.location.split(",")]
        if profile.location
        else []
    )
    if profile.location and any(part in raw_lower for part in loc_parts):
        confidences["location"] = 0.90
    elif profile.location:
        confidences["location"] = 0.40
    else:
        confidences["location"] = 0.0

    # 5. Summary
    if profile.summary and len(profile.summary) > 20:
        # Check if snippet of summary was in raw text
        sample = profile.summary[:50].lower()
        if sample in raw_lower:
            confidences["summary"] = 0.95
        else:
            confidences["summary"] = 0.75  # LLM synthesized professional summary
    else:
        confidences["summary"] = 0.0

    # 6. Skills
    if profile.skills:
        grounded_count = sum(1 for s in profile.skills if s.name.lower() in raw_lower)
        ratio = grounded_count / len(profile.skills)
        confidences["skills"] = round(0.50 + (0.45 * ratio), 2)
    else:
        confidences["skills"] = 0.0

    # 7. Experience
    if profile.experience:
        company_grounded = sum(1 for exp in profile.experience if exp.company.lower() in raw_lower)
        ratio = company_grounded / len(profile.experience)
        confidences["experience"] = round(0.50 + (0.48 * ratio), 2)
    else:
        confidences["experience"] = 0.0

    # 8. Education
    if profile.education:
        edu_grounded = sum(
            1 for edu in profile.education if edu.institution.lower() in raw_lower
        )
        ratio = edu_grounded / len(profile.education)
        confidences["education"] = round(0.50 + (0.45 * ratio), 2)
    else:
        confidences["education"] = 0.0

    # 9. Projects
    if profile.projects:
        proj_grounded = sum(1 for pr in profile.projects if pr.name.lower() in raw_lower)
        ratio = proj_grounded / len(profile.projects)
        confidences["projects"] = round(0.50 + (0.40 * ratio), 2)
    else:
        confidences["projects"] = 0.0

    return confidences


def post_process_parsed_profile(
    profile: ParsedProfile,
    raw_text: str,
) -> ParsedProfile:
    """Execute deterministic post-processing pipeline on extracted profile."""
    # 1. Normalise dates in experience & education
    for exp in profile.experience:
        exp.start = normalize_date_string(exp.start) or exp.start
        exp.end = normalize_date_string(exp.end)
        exp.technologies = [canonicalize_skill(t) for t in exp.technologies]

    for edu in profile.education:
        edu.start = normalize_date_string(edu.start)
        edu.end = normalize_date_string(edu.end)

    for proj in profile.projects:
        proj.technologies = [canonicalize_skill(t) for t in proj.technologies]

    # 2. Deduplicate skills with alias map
    profile.skills = deduplicate_skills(profile.skills)

    # 3. Validate contact info
    email, phone, links = validate_contact_info(profile.email, profile.phone, profile.links)
    profile.email = email
    profile.phone = phone
    profile.links = links

    # 4. Compute field confidence scores
    profile.field_confidence = compute_field_confidences(profile, raw_text)

    return profile
