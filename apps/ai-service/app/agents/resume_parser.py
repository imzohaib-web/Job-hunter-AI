from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.llm.client import generate_structured
from app.llm.security import wrap_untrusted
from app.schemas.profile import ParsedProfile
from app.services.file_validator import validate_resume_file
from app.services.normalizer import post_process_parsed_profile
from app.services.section_segmenter import (
    format_segmented_chunks,
    segment_resume_sections,
)
from app.services.text_extractor import extract_resume_text

logger = logging.getLogger("jobpilot.resume_parser")

RESUME_EXTRACTION_PROMPT = """You are an expert resume parsing specialist.
Extract the candidate's structured profile accurately from the segmented resume text provided below.

Rules:
1. Extract facts strictly present in the resume text. Never invent degrees, employers or metrics.
2. For each skill, identify category (Languages, Frameworks, Cloud, Databases, Tools) and evidence.
3. In work experience, capture company, title, start date, end date, bullets, and technologies.
4. In education, capture institution, degree, field of study, graduation dates, and GPA.
5. In projects, capture project name, description, technologies, and URLs.
6. Extract contact details (name, email, phone, location, links).

Segmented Resume Content:
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
    if not raw_text:
        raise ValueError("Could not extract any readable text from the uploaded resume file.")

    # 3. Section segmentation heuristic
    sections = segment_resume_sections(raw_text)
    formatted_chunks = format_segmented_chunks(sections)

    # 4. Wrap untrusted input and invoke LLM for structured extraction
    untrusted_payload = wrap_untrusted(
        label="candidate_resume",
        text=formatted_chunks,
        max_chars=15000,
    )

    llm_output = await generate_structured(
        prompt_template=RESUME_EXTRACTION_PROMPT,
        variables={"segmented_resume_data": untrusted_payload},
        output_model=ParsedProfile,
        temperature=0.0,
        task_name="resume_parser",
    )

    # 5. Deterministic post-processing: dates, skill aliasing/deduping, contact regex, confidence
    processed_profile = post_process_parsed_profile(llm_output, raw_text)

    latency_ms = (time.perf_counter() - start_time) * 1000
    # Audit log metrics ONLY: never log resume text or PII (Hard Rule 6)
    logger.info(
        "Resume parsing completed: filename=%s file_type=%s pages=%d ocr=%s "
        "warnings=%d latency_ms=%.2f",
        filename,
        detected_type,
        extraction.pages_extracted,
        extraction.ocr_used,
        len(warnings),
        latency_ms,
    )

    return ResumeParseResult(
        profile=processed_profile,
        warnings=warnings,
    )
