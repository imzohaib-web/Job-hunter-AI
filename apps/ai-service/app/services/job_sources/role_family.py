from __future__ import annotations

import re
from typing import Any

# Tech Families
FAMILY_SOFTWARE_WEB = "software/web"
FAMILY_DATA_AI = "data/ai/ml"
FAMILY_DEVOPS_CLOUD = "devops/cloud"
FAMILY_QA = "qa"
FAMILY_ADJACENT_TECH = "adjacent/solutions_architect"

TECH_FAMILIES = {
    FAMILY_SOFTWARE_WEB,
    FAMILY_DATA_AI,
    FAMILY_DEVOPS_CLOUD,
    FAMILY_QA,
}

# Non-Tech Families
FAMILY_SALES = "sales"
FAMILY_MARKETING_CONTENT = "marketing/content/writing"
FAMILY_CUSTOMER_SUPPORT = "customer_support/service"
FAMILY_ADMIN_OFFICE = "admin/office"
FAMILY_HEALTHCARE = "healthcare"
FAMILY_FINANCE_ACCOUNTING = "finance/accounting"
FAMILY_HR = "hr"
FAMILY_DESIGN = "design"
FAMILY_ENGINEERING_OTHER = "mechanical_electrical_medical_device"
FAMILY_MANUFACTURING = "manufacturing"
FAMILY_LEGAL = "legal"
FAMILY_EDUCATION_ANNOTATION = "education_training_annotation"

NON_TECH_FAMILIES = {
    FAMILY_SALES,
    FAMILY_MARKETING_CONTENT,
    FAMILY_CUSTOMER_SUPPORT,
    FAMILY_ADMIN_OFFICE,
    FAMILY_HEALTHCARE,
    FAMILY_FINANCE_ACCOUNTING,
    FAMILY_HR,
    FAMILY_DESIGN,
    FAMILY_ENGINEERING_OTHER,
    FAMILY_MANUFACTURING,
    FAMILY_LEGAL,
    FAMILY_EDUCATION_ANNOTATION,
}

# Regex patterns for non-tech roles (checked first to catch e.g. "AI Trainer", "Sales Engineer", "Medical Device Engineer")
NON_TECH_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        FAMILY_EDUCATION_ANNOTATION,
        re.compile(
            r"\b(annotation|annotator|labeller|labeler|evaluator|trainer|ai trainer|video annotation|curator|instructional designer|tutor|teacher|instructor|curriculum|prompt annotator)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_MARKETING_CONTENT,
        re.compile(
            r"\b(content creator|copywriter|content writer|content reviewer|technical writer|product marketing|community manager|social media|seo specialist|marketing coordinator|marketing manager|creative director|video editor|growth marketer|communications specialist)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_CUSTOMER_SUPPORT,
        re.compile(
            r"\b(customer success|customer success architect|customer success manager|technical support|support engineer|patient care advocate|customer support|customer service|help desk|client support|call center|contact center|care advocate|technical support specialist|tier 1 support|tier 2 support)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_SALES,
        re.compile(
            r"\b(sales|inside sales|sales engineer|presales|pre-sales|solutions architect \(pre-sales\)|account executive|account manager|technical account manager|verkaufsberater|vertrieb|business development|bdr|sdr|sales representative|sales director|client executive|telemarketing|sales consultant)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_ADMIN_OFFICE,
        re.compile(
            r"\b(office assistant|receptionist|front desk|executive assistant|administrative assistant|virtual assistant|clerk|data entry|office coordinator|office manager)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_HEALTHCARE,
        re.compile(
            r"\b(patient care|nurse|physician|medical|healthcare|clinical|therapist|pharmacist|dental|caregiver)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_ENGINEERING_OTHER,
        re.compile(
            r"\b(medical device|medical devices|mechanical engineer|civil engineer|electrical engineer|chemical engineer|hardware engineer|design assurance|automotive engineer|pcb|embedded hardware)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_DESIGN,
        re.compile(
            r"\b(graphic designer|ui/ux designer|visual designer|product designer|illustrator|animator|art director|3d artist)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_HR,
        re.compile(
            r"\b(human resources|recruiter|technical recruiter|talent acquisition|hr generalist|hr manager|people operations|sourcer)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_FINANCE_ACCOUNTING,
        re.compile(
            r"\b(accountant|bookkeeper|financial analyst|payroll|controller|tax|auditor|underwriter)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_MANUFACTURING,
        re.compile(
            r"\b(warehouse|machinist|assembly|technician|plant manager|production worker|forklift|logistics coordinator|courier|driver)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_LEGAL,
        re.compile(
            r"\b(paralegal|lawyer|legal counsel|attorney|contract specialist|compliance analyst|regulatory affairs)\b",
            re.IGNORECASE,
        ),
    ),
]

# Regex patterns for tech roles
TECH_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        FAMILY_QA,
        re.compile(
            r"\b(qa|sdet|quality assurance|software tester|automation engineer|test engineer|qa engineer|test automation)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_DEVOPS_CLOUD,
        re.compile(
            r"\b(devops|sre|site reliability|cloud engineer|platform engineer|infrastructure engineer|kubernetes|aws engineer|systems engineer)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_DATA_AI,
        re.compile(
            r"\b(data engineer|data scientist|machine learning|ml engineer|ai engineer|ai researcher|llm engineer|nlp engineer|computer vision|deep learning|data analyst|bi developer)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_ADJACENT_TECH,
        re.compile(
            r"\b(solutions architect|solution architect|partner solutions architect|cloud architect|enterprise architect)\b",
            re.IGNORECASE,
        ),
    ),
    (
        FAMILY_SOFTWARE_WEB,
        re.compile(
            r"\b(software engineer|software developer|full stack|full-stack|fullstack|frontend|front-end|backend|back-end|web developer|react developer|python developer|node developer|node\.js|javascript developer|typescript developer|golang developer|java developer|c\+\+ developer|mobile developer|ios developer|android developer|firmware engineer|programmer|lead developer|head of engineering|engineering manager|tech lead|architect|staff engineer|principal engineer)\b",
            re.IGNORECASE,
        ),
    ),
]

GERMAN_LANGUAGE_MARKERS = re.compile(
    r"(\(m/w/d\)|\(w/m/d\)|\(f/m/d\)|\(m/w/x\)|\(d/m/w\)|festanstellung|vollzeit|teilzeit|aussendienst|entwicklungsingenieur|berater:in|spezialist)",
    re.IGNORECASE,
)

COMMON_GERMAN_WORDS = re.compile(
    r"\b(und|für|wir|uns|ihre|aufgaben|profil|über|mit|sowie|erfahrung|abgeschlossenes|studium|kenntnisse)\b",
    re.IGNORECASE,
)


def classify_role_family(
    title: str,
    tags: list[str] | None = None,
    description: str = "",
) -> str:
    """Classifies a job position into a specific tech or non-tech role family.

    Non-tech patterns are inspected first to prevent non-software roles like
    'AI Trainer' or 'Design Assurance Engineer' from being classified as software.
    """
    clean_title = title.lower().strip()
    tag_str = " ".join(tags or []).lower()
    combined_header = f"{clean_title} {tag_str}"

    # 1. First check explicit non-tech patterns
    for family, pattern in NON_TECH_PATTERNS:
        if pattern.search(clean_title):
            return family

    # 2. Check tech patterns against title and tags
    for family, pattern in TECH_PATTERNS:
        if pattern.search(combined_header):
            return family

    # 3. Check description fallback for non-tech signals if title was ambiguous
    desc_start = description[:300].lower()
    for family, pattern in NON_TECH_PATTERNS:
        if pattern.search(desc_start):
            return family

    # 4. Check description for strong software/engineering presence
    for family, pattern in TECH_PATTERNS:
        if pattern.search(desc_start):
            return family

    # Default to non-tech admin/other if completely unidentified
    return FAMILY_ADMIN_OFFICE


def is_job_english(title: str, description: str = "") -> bool:
    """Returns False if job exhibits strong German or other non-English markers."""
    if GERMAN_LANGUAGE_MARKERS.search(title):
        return False

    desc_sample = description[:600]
    if GERMAN_LANGUAGE_MARKERS.search(desc_sample):
        return False

    # Check German stopwords frequency
    german_matches = COMMON_GERMAN_WORDS.findall(desc_sample)
    if len(german_matches) >= 3:
        return False

    return True


from app.services.job_sources.location_parser import parse_location


def is_location_compatible_for_candidate(
    job_location: str,
    job_remote: bool | None,
    candidate_country: str = "Pakistan",
    open_to_relocation: bool = False,
    remote_worldwide: bool = True,
    description: str = "",
) -> tuple[bool, str | None]:
    """Evaluates whether job location is compatible with candidate's circumstances.

    Returns:
        (is_compatible: bool, restriction_note: str | None)
    """
    parsed = parse_location(
        raw_location=job_location,
        is_remote_flag=job_remote,
        description=description,
        candidate_country=candidate_country,
        open_to_relocation=open_to_relocation,
        remote_worldwide_accepted=remote_worldwide,
    )
    return parsed.is_compatible, (parsed.restriction_note or parsed.incompatible_reason)
