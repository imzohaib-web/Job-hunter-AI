from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.llm.client import generate_structured
from app.llm.security import wrap_untrusted
from app.schemas.profile import ParsedProfile, SimplifiedProfile
from app.services.file_validator import validate_resume_file
from app.services.normalizer import post_process_parsed_profile
from app.services.section_segmenter import (
    format_segmented_chunks,
    segment_resume_sections,
)
from app.services.text_extractor import extract_resume_text

logger = logging.getLogger("jobpilot.resume_parser")

RESUME_EXTRACTION_PROMPT = """You are an expert resume parsing specialist.
Extract the candidate's structured profile accurately from the segmented resume text provided below with ZERO loss of content.

Instructions:
1. Extract facts strictly present in the resume text. Never invent degrees, employers, metrics, or skills.
2. Extract in this order:
   - Contact details: full name, headline/title (if present), email, phone, location.
   - Links: extract as structured objects with label and url (for example label 'GitHub' with its url, label 'LinkedIn' with its url, label 'Portfolio' with its url).
   - Professional summary.
   - Skills: preserve the candidate's EXACT skill categories and groupings (e.g. 'Backend', 'AI / LLM', 'Databases', 'Frontend', 'Languages', 'Tools & Deployment', 'Fundamentals') in `skill_groups` with group label and list of items. Also populate `skills` with ProfileSkill items.
   - Work experience: company, title, start date, end date, location, `is_current`, bullet points preserving all metrics and quantified achievements, and technologies.
   - Key projects: project name, `context_line` (e.g. team size, supervisor, hackathon award, stack), year/dates, tech stack, and ALL accomplishment bullet points (`bullets`) preserving exact numbers and metrics (e.g. 10 FastAPI routers, 27 endpoints, 162 pytest tests, 6 modules, offline fallback).
   - Education: institution, degree, field of study (if distinct from degree), start date, end date, `expected` (true if ongoing/expected), `gpa` (e.g. "3.3"), `gpa_scale` (e.g. "4.0"), `coursework` (list of course titles: Data Structures & Algorithms, Object-Oriented Programming, Machine Learning, etc.), honors.
   - Certifications: name, issuer, year/date, url.
   - Scholarships & Awards: name, issuer, year, description in `scholarships`.
3. Do not invent any facts, and do NOT truncate or collapse bullets into single paragraphs.

Segmented Resume Content:
{segmented_resume_data}
"""

SIMPLIFIED_EXTRACTION_PROMPT = """You are an expert resume parsing specialist.
Extract the core work experience, education, projects, and skills from the resume text provided below without losing details.

Instructions:
1. Extract all work experience entries (company, title, start date, end date, bullet points, technologies).
2. Extract all education entries (institution, degree, field of study, graduation dates, GPA, coursework).
3. Extract all projects with their context lines and individual bullet points.
4. Extract technical skills preserving category groups (Backend, AI / LLM, Databases, Frontend, Languages, Tools & Deployment, Fundamentals).
5. Extract facts strictly present in the resume text. Never collapse bullets into paragraphs.

Resume Content:
{segmented_resume_data}
"""


@dataclass
class ResumeParseResult:
    profile: ParsedProfile
    warnings: list[str]


async def parse_resume_content(
    file_bytes: bytes,
    filename: str,
) -> ResumeParseResult:
    """Execute end-to-end resume parsing pipeline from raw bytes to structured ParsedProfile."""
    start_time = time.perf_counter()
    warnings: list[str] = []

    # 1. Validate file constraints: size <= 5 MB, magic bytes, page count <= 10
    detected_type = validate_resume_file(file_bytes, filename)

    # 2. Extract text with layout preservation and OCR fallback
    extraction = extract_resume_text(file_bytes, detected_type)
    warnings.extend(extraction.warnings)

    raw_text = extraction.text.strip()
    if len(raw_text) < 200:
        raise ValueError(
            f"Extracted resume text is too short ({len(raw_text)} characters, minimum 200 required). "
            "Please ensure the file contains readable, uncorrupted text."
        )

    # 3. Section segmentation heuristic
    sections = segment_resume_sections(raw_text)
    formatted_chunks = format_segmented_chunks(sections)

    # 4. Wrap untrusted input and invoke LLM for structured extraction
    untrusted_payload = wrap_untrusted(
        label="candidate_resume",
        text=formatted_chunks,
        max_chars=15000,
    )

    llm_output: ParsedProfile | None = None
    try:
        llm_output = await generate_structured(
            prompt_template=RESUME_EXTRACTION_PROMPT,
            variables={"segmented_resume_data": untrusted_payload},
            output_model=ParsedProfile,
            temperature=0.0,
            max_tokens=4096,
            task_name="resume_parser",
        )
    except Exception as exc:
        logger.warning(
            "Primary structured parse failed for filename=%s: %s; attempting fallback with simplified schema",
            filename,
            exc,
        )
        warnings.append(f"Primary parser encountered an issue ({exc}); used simplified fallback schema.")

    # 5. Check if fallback improvement is needed (Requirement 5)
    # If primary parse failed OR returned empty experience/education while sections exist
    has_experience_section = "experience" in sections or "work" in raw_text.lower()
    has_education_section = "education" in sections or "university" in raw_text.lower() or "degree" in raw_text.lower()

    needs_fallback = (
        llm_output is None
        or (has_experience_section and len(llm_output.experience) == 0)
        or (has_education_section and len(llm_output.education) == 0)
    )

    if needs_fallback:
        logger.info(
            "Triggering fallback simplified parse for filename=%s (experience_empty=%s, education_empty=%s)",
            filename,
            len(llm_output.experience) == 0 if llm_output else True,
            len(llm_output.education) == 0 if llm_output else True,
        )
        try:
            simplified = await generate_structured(
                prompt_template=SIMPLIFIED_EXTRACTION_PROMPT,
                variables={"segmented_resume_data": untrusted_payload},
                output_model=SimplifiedProfile,
                temperature=0.0,
                max_tokens=4096,
                task_name="resume_parser_simplified",
            )

            if llm_output is None:
                llm_output = ParsedProfile(
                    name=filename.split(".")[0].replace("_", " ").title(),
                    skills=simplified.skills,
                    experience=simplified.experience,
                    education=simplified.education,
                    projects=simplified.projects,
                )
            else:
                if len(llm_output.experience) == 0 and simplified.experience:
                    llm_output.experience = simplified.experience
                if len(llm_output.education) == 0 and simplified.education:
                    llm_output.education = simplified.education
                if len(llm_output.skills) == 0 and simplified.skills:
                    llm_output.skills = simplified.skills
                if len(llm_output.projects) == 0 and simplified.projects:
                    llm_output.projects = simplified.projects

            warnings.append("Applied fallback simplified extraction to recover resume sections.")
        except Exception as fallback_exc:
            logger.warning("Fallback simplified parse also failed: %s", fallback_exc)
            warnings.append(f"Fallback parse error: {fallback_exc}")

    if llm_output is None:
        raise ValueError("Could not extract structured candidate profile from resume after all parse attempts.")

    # 6. Never return an empty profile silently (Requirement 2)
    if (
        len(llm_output.skills) == 0
        and len(llm_output.experience) == 0
        and len(llm_output.education) == 0
    ):
        raise ValueError(
            "Resume parsing resulted in an empty profile with no skills, experience, or education. "
            "Please check that the resume has standard sections."
        )

    # 7. Deterministic post-processing: dates, skill aliasing/deduping, contact regex, confidence
    processed_profile = post_process_parsed_profile(llm_output, raw_text)

    latency_ms = (time.perf_counter() - start_time) * 1000
    # Audit log metrics ONLY: never log resume text or PII (Hard Rule 6)
    logger.info(
        "Resume parsing completed: filename=%s file_type=%s pages=%d ocr=%s "
        "skills=%d experience=%d education=%d projects=%d warnings=%d latency_ms=%.2f",
        filename,
        detected_type,
        extraction.pages_extracted,
        extraction.ocr_used,
        len(processed_profile.skills),
        len(processed_profile.experience),
        len(processed_profile.education),
        len(processed_profile.projects),
        len(warnings),
        latency_ms,
    )

    return ResumeParseResult(
        profile=processed_profile,
        warnings=warnings,
    )
