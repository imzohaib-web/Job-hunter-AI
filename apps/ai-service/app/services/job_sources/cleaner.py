from __future__ import annotations

import html
import re
from typing import Final

# Regexes for HTML sanitization
BLOCK_TAG_RE: Final[re.Pattern[str]] = re.compile(
    r"<(?:p|br|div|li|tr|h[1-6]|blockquote|pre|hr)(?:\s+[^>]*)?/?>",
    re.IGNORECASE,
)
HTML_TAG_RE: Final[re.Pattern[str]] = re.compile(r"<[^>]+>")
WHITESPACE_RE: Final[re.Pattern[str]] = re.compile(r"[ \t]+")
MULTI_NEWLINE_RE: Final[re.Pattern[str]] = re.compile(r"\n{3,}")

# Normalization suffix removal
COMPANY_SUFFIX_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:inc\.?|llc\.?|ltd\.?|corp\.?|corporation|gmbh|co\.?|sa\.?|ag|pty)\b",
    re.IGNORECASE,
)
PUNCT_RE: Final[re.Pattern[str]] = re.compile(r"[^\w\s]")


def strip_html(raw_html: str | None, max_length: int = 10000) -> str:
    """Sanitize and strip HTML tags, unescape entities, and cap length."""
    if not raw_html:
        return ""

    # Replace block level tags with newlines
    text = BLOCK_TAG_RE.sub("\n", raw_html)
    # Remove all other HTML tags
    text = HTML_TAG_RE.sub(" ", text)
    # Unescape HTML entities (&amp;, &nbsp;, etc.)
    text = html.unescape(text)
    # Replace non-breaking spaces with standard space
    text = text.replace("\xa0", " ")
    # Normalize inline whitespace
    text = WHITESPACE_RE.sub(" ", text)
    # Strip whitespace per line
    lines = [line.strip() for line in text.splitlines()]
    # Join and collapse extra blank lines
    cleaned = "\n".join(lines).strip()
    cleaned = MULTI_NEWLINE_RE.sub("\n\n", cleaned)

    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].rstrip() + "..."
    return cleaned


def normalize_company(name: str | None) -> str:
    """Canonicalize company name for deduplication."""
    if not name:
        return ""
    text = name.lower().strip()
    text = COMPANY_SUFFIX_RE.sub("", text)
    text = PUNCT_RE.sub("", text)
    return " ".join(text.split())


def normalize_title(title: str | None) -> str:
    """Canonicalize job title for deduplication."""
    if not title:
        return ""
    text = title.lower().strip()
    # Strip common parenthetical remote markers
    text = re.sub(r"[\(\[\{]?(?:remote|hybrid|wfh)[\)\]\}]?", "", text, flags=re.IGNORECASE)
    text = PUNCT_RE.sub(" ", text)
    return " ".join(text.split())


def normalize_location(location: str | None) -> str:
    """Canonicalize location string (maps variants of remote to 'remote')."""
    if not location:
        return "remote"
    loc = location.lower().strip()
    if any(term in loc for term in ("remote", "telecommute", "anywhere", "wfh", "virtual")):
        return "remote"
    loc = PUNCT_RE.sub(" ", loc)
    return " ".join(loc.split())


def detect_seniority(title: str, description: str = "") -> str:
    """Infer role seniority level from title and description."""
    combined = f"{title} {description[:300]}".lower()

    if re.search(r"\b(intern|internship|trainee|apprentice)\b", combined):
        return "entry"
    if re.search(r"\b(junior|jr\.?|associate|entry level|graduate)\b", combined):
        return "junior"
    if re.search(r"\b(principal|distinguished|fellow)\b", combined):
        return "principal"
    if re.search(r"\b(staff)\b", combined):
        return "staff"
    if re.search(r"\b(lead|tech lead|team lead|director|vp|head of)\b", combined):
        return "lead"
    if re.search(r"\b(senior|sr\.?)\b", combined):
        return "senior"
    return "mid"


def parse_salary_range(salary_raw: str | None) -> tuple[float | None, float | None, str | None]:
    """Extract numeric salary bounds and currency from freeform string."""
    if not salary_raw:
        return None, None, None

    currency = None
    if "$" in salary_raw or "USD" in salary_raw.upper():
        currency = "USD"
    elif "€" in salary_raw or "EUR" in salary_raw.upper():
        currency = "EUR"
    elif "£" in salary_raw or "GBP" in salary_raw.upper():
        currency = "GBP"

    # Find numbers (handling k/K abbreviations and commas)
    # e.g., "$120k - $150k", "120,000 - 150,000", "120000"
    matches = re.findall(r"(\d+(?:[.,]\d+)?)\s*(k|K)?", salary_raw)
    if not matches:
        return None, None, currency

    values: list[float] = []
    for num_str, is_k in matches:
        clean_num = num_str.replace(",", "")
        try:
            val = float(clean_num)
            if is_k:
                val *= 1000
            elif val < 1000 and "year" in salary_raw.lower():
                val *= 1000  # e.g., "120/year" -> 120k
            values.append(val)
        except ValueError:
            continue

    if not values:
        return None, None, currency

    if len(values) == 1:
        return values[0], values[0], currency

    min_val = min(values[0], values[1])
    max_val = max(values[0], values[1])
    return min_val, max_val, currency


REGION_SUFFIX_RE: Final[re.Pattern[str]] = re.compile(
    r"[,\|\-\/]\s*(?:neur|france|emea|apac|latam|us|usa|uk|germany|berlin|paris|london|remote|europe|north america|greece|athens|madrid|singapore|dubai|canada)\s*$",
    re.IGNORECASE,
)


def extract_base_title_and_region(title: str) -> tuple[str, str | None]:
    """Strip region/country/location suffixes from title and return (base_title, region)."""
    match = REGION_SUFFIX_RE.search(title)
    if match:
        region = re.sub(r"^[,\|\-\/\s]+", "", match.group(0)).strip()
        base = title[:match.start()].strip()
        return base, region
    return title.strip(), None


def collapse_near_duplicates(postings: list[Any]) -> list[Any]:
    """Treat postings with same company and same base title (after removing region suffixes) as one card.

    Preserves the primary posting and notes additional regions in duplicate_locations.
    """
    seen: dict[tuple[str, str], Any] = {}
    collapsed: list[Any] = []

    for job in postings:
        company_key = normalize_company(getattr(job, "company", ""))
        base_title, region = extract_base_title_and_region(getattr(job, "title", ""))
        title_key = normalize_title(base_title)

        key = (company_key, title_key)
        if key in seen:
            primary = seen[key]
            # Collect extra region tag
            extra_loc = region or getattr(job, "location", "")
            if extra_loc and extra_loc not in primary.duplicate_locations:
                primary.duplicate_locations.append(extra_loc)
        else:
            if region and region not in job.duplicate_locations:
                job.duplicate_locations.append(region)
            seen[key] = job
            collapsed.append(job)

    return collapsed
