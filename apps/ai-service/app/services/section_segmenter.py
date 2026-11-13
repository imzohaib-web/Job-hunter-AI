from __future__ import annotations

import re

SECTION_PATTERNS: dict[str, list[str]] = {
    "summary": [
        r"^professional\s+summary$",
        r"^summary$",
        r"^executive\s+summary$",
        r"^profile$",
        r"^about\s+me$",
        r"^career\s+objective$",
        r"^objective$",
    ],
    "experience": [
        r"^work\s+experience$",
        r"^professional\s+experience$",
        r"^employment\s+history$",
        r"^experience$",
        r"^work\s+history$",
        r"^relevant\s+experience$",
    ],
    "education": [
        r"^education$",
        r"^academic\s+background$",
        r"^academic\s+history$",
        r"^degrees$",
    ],
    "skills": [
        r"^technical\s+skills$",
        r"^core\s+competencies$",
        r"^skills\s*(&|and)?\s*technologies$",
        r"^skills$",
        r"^technologies$",
        r"^tools\s*(&|and)?\s*frameworks$",
    ],
    "projects": [
        r"^personal\s+projects$",
        r"^key\s+projects$",
        r"^technical\s+projects$",
        r"^projects$",
    ],
    "certifications": [
        r"^certifications$",
        r"^certificates$",
        r"^licenses\s*(&|and)?\s*certifications$",
        r"^credentials$",
    ],
    "languages": [
        r"^languages$",
        r"^language\s+proficiency$",
    ],
}


def segment_resume_sections(raw_text: str) -> dict[str, str]:
    """Segment resume text into labelled semantic sections (header, experience, education, etc.)."""
    sections: dict[str, list[str]] = {
        "header": [],
        "summary": [],
        "experience": [],
        "education": [],
        "skills": [],
        "projects": [],
        "certifications": [],
        "languages": [],
        "other": [],
    }

    current_section = "header"
    lines = raw_text.splitlines()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Check if line looks like a section heading (short, matching heading pattern)
        clean_heading = re.sub(r"^[\d\.\s#*\-_|:]+|[:\-_|#*]+$", "", stripped).strip().lower()
        matched_section: str | None = None

        if len(clean_heading) <= 45:
            for sec_name, patterns in SECTION_PATTERNS.items():
                if any(re.match(p, clean_heading) for p in patterns):
                    matched_section = sec_name
                    break

        if matched_section:
            current_section = matched_section
            continue

        sections[current_section].append(stripped)

    # Join lines for each non-empty section
    return {
        sec: "\n".join(content)
        for sec, content in sections.items()
        if content
    }


def format_segmented_chunks(sections: dict[str, str]) -> str:
    """Format labelled chunks for clear contextual ingestion by LLM."""
    chunks: list[str] = []
    for section_name, text in sections.items():
        chunks.append(f"=== SECTION: {section_name.upper()} ===\n{text}")
    return "\n\n".join(chunks)
