from __future__ import annotations

import logging
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.agents.resume_parser import parse_resume_content
from app.core.config import get_settings
from app.main import create_app
from app.schemas.profile import (
    Certification,
    Education,
    LanguageProficiency,
    ParsedProfile,
    ProfileSkill,
    Project,
    WorkExperience,
)
from app.services.file_validator import FileValidationError, validate_resume_file
from app.services.normalizer import (
    compute_field_confidences,
    deduplicate_skills,
    normalize_date_string,
    post_process_parsed_profile,
)
from app.services.section_segmenter import format_segmented_chunks, segment_resume_sections
from app.services.text_extractor import (
    extract_resume_text,
    extract_text_from_docx,
    extract_text_from_pdf,
)

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def single_col_pdf_bytes() -> bytes:
    path = FIXTURES_DIR / "resume_single_column.pdf"
    return path.read_bytes()


@pytest.fixture
def two_col_pdf_bytes() -> bytes:
    path = FIXTURES_DIR / "resume_two_column.pdf"
    return path.read_bytes()


@pytest.fixture
def scanned_pdf_bytes() -> bytes:
    path = FIXTURES_DIR / "resume_scanned.pdf"
    return path.read_bytes()


@pytest.fixture
def sample_docx_bytes() -> bytes:
    path = FIXTURES_DIR / "resume_sample.docx"
    return path.read_bytes()


@pytest.fixture
def mock_parsed_profile() -> ParsedProfile:
    return ParsedProfile(
        name="Alex Mercer",
        email="alex.mercer@example.com",
        phone="(555) 019-2834",
        location="Seattle, WA",
        links=["https://linkedin.com/in/alexmercer"],
        summary=(
            "Senior Backend Engineer with 6+ years of experience "
            "designing high-throughput systems."
        ),
        skills=[
            ProfileSkill(name="py", category="Languages"),
            ProfileSkill(name="Python", category="Languages"),
            ProfileSkill(name="FastAPI", category="Frameworks"),
            ProfileSkill(name="node", category="Frameworks"),
            ProfileSkill(name="Postgres", category="Databases"),
        ],
        experience=[
            WorkExperience(
                company="CloudScale Inc.",
                title="Senior Backend Engineer",
                start="Jan 2021",
                end="Present",
                bullets=[
                    "Architected and deployed microservices handling 25M daily requests.",
                    "Reduced database p99 latency by 45%.",
                ],
                technologies=["Python", "FastAPI", "Kafka", "Postgres"],
            )
        ],
        education=[
            Education(
                institution="University of Washington",
                degree="Bachelor of Science",
                field_of_study="Computer Science",
                start="Sep 2014",
                end="Jun 2018",
                gpa="3.8",
            )
        ],
        projects=[
            Project(
                name="JobPilot Agent",
                description="Autonomous AI-driven career acceleration tool.",
                technologies=["Python", "OpenAI"],
            )
        ],
        certifications=[Certification(name="AWS Certified Solutions Architect - Associate")],
        languages=[LanguageProficiency(language="English", proficiency="native")],
        field_confidence={},
    )


# ==============================================================================
# 1. File Validator Tests
# ==============================================================================


def test_validate_file_size_exceeded() -> None:
    large_payload = b"%PDF-" + b"0" * (5 * 1024 * 1024 + 1)
    with pytest.raises(FileValidationError) as exc:
        validate_resume_file(large_payload, "resume.pdf")
    assert exc.value.code == "FILE_TOO_LARGE"


def test_validate_invalid_magic_bytes() -> None:
    fake_file = b"This is plain text pretending to be a pdf"
    with pytest.raises(FileValidationError) as exc:
        validate_resume_file(fake_file, "resume.pdf")
    assert exc.value.code == "INVALID_FILE_TYPE"


def test_validate_extension_mismatch(single_col_pdf_bytes: bytes) -> None:
    with pytest.raises(FileValidationError) as exc:
        validate_resume_file(single_col_pdf_bytes, "resume.docx")
    assert exc.value.code == "EXTENSION_MISMATCH"


def test_validate_page_count_exceeded() -> None:
    doc = pymupdf.open()
    for _ in range(11):
        doc.new_page()
    pdf_bytes = doc.tobytes()
    doc.close()

    with pytest.raises(FileValidationError) as exc:
        validate_resume_file(pdf_bytes, "long_resume.pdf")
    assert exc.value.code == "PAGE_COUNT_EXCEEDED"


def test_validate_valid_files(
    single_col_pdf_bytes: bytes,
    sample_docx_bytes: bytes,
) -> None:
    assert validate_resume_file(single_col_pdf_bytes, "resume.pdf") == "pdf"
    assert validate_resume_file(sample_docx_bytes, "resume.docx") == "docx"


# ==============================================================================
# 2. Text Extraction Tests
# ==============================================================================


def test_extract_single_column_pdf(single_col_pdf_bytes: bytes) -> None:
    result = extract_text_from_pdf(single_col_pdf_bytes)
    assert "Alex Mercer" in result.text
    assert "CloudScale Inc." in result.text
    assert "FastAPI" in result.text
    assert not result.ocr_used
    assert result.pages_extracted == 1


def test_extract_two_column_pdf(two_col_pdf_bytes: bytes) -> None:
    result = extract_text_from_pdf(two_col_pdf_bytes)
    assert "JORDAN LEE" in result.text
    assert "NextTech Systems" in result.text
    assert "UC Berkeley" in result.text
    assert not result.ocr_used


def test_extract_scanned_pdf_triggers_ocr(scanned_pdf_bytes: bytes) -> None:
    result = extract_text_from_pdf(scanned_pdf_bytes)
    assert result.ocr_used is True
    assert any("Scanned PDF detected" in w for w in result.warnings)


def test_extract_docx_with_tables(sample_docx_bytes: bytes) -> None:
    result = extract_text_from_docx(sample_docx_bytes)
    assert "Morgan Reed" in result.text
    assert "Austin CloudWorks" in result.text
    assert "Languages | Python, TypeScript, SQL, Go" in result.text
    assert not result.ocr_used


def test_extract_resume_text_dispatcher(single_col_pdf_bytes: bytes) -> None:
    pdf_result = extract_resume_text(single_col_pdf_bytes, "pdf")
    assert "Alex Mercer" in pdf_result.text

    with pytest.raises(ValueError, match="Unsupported file type"):
        extract_resume_text(single_col_pdf_bytes, "txt")


# ==============================================================================
# 3. Section Segmentation Heuristic Tests
# ==============================================================================


def test_section_segmenter(single_col_pdf_bytes: bytes) -> None:
    extraction = extract_text_from_pdf(single_col_pdf_bytes)
    sections = segment_resume_sections(extraction.text)

    assert "header" in sections
    assert "Alex Mercer" in sections["header"]
    assert "experience" in sections
    assert "CloudScale Inc." in sections["experience"]
    assert "education" in sections
    assert "University of Washington" in sections["education"]
    assert "skills" in sections
    assert "FastAPI" in sections["skills"]

    formatted = format_segmented_chunks(sections)
    assert "=== SECTION: HEADER ===" in formatted
    assert "=== SECTION: EXPERIENCE ===" in formatted


# ==============================================================================
# 4. Normalization and Confidence Calculation Tests
# ==============================================================================


def test_skill_aliasing_and_deduplicating() -> None:
    raw_skills = [
        ProfileSkill(name="js", category="Languages"),
        ProfileSkill(name="JavaScript", category="Languages"),
        ProfileSkill(name="node", category="Frameworks"),
        ProfileSkill(name="Node.js", category="Frameworks"),
        ProfileSkill(name="py", category="Languages"),
        ProfileSkill(name="FastAPI", category="Frameworks"),
    ]
    normalized = deduplicate_skills(raw_skills)
    skill_names = [s.name for s in normalized]

    # 'js' and 'JavaScript' deduplicate to 'JavaScript'
    assert skill_names.count("JavaScript") == 1
    # 'node' and 'Node.js' deduplicate to 'Node.js'
    assert skill_names.count("Node.js") == 1
    # 'py' normalizes to 'Python'
    assert "Python" in skill_names
    assert "FastAPI" in skill_names


def test_date_normalization() -> None:
    assert normalize_date_string("Jan 2021") == "2021-01"
    assert normalize_date_string("March 2020") == "2020-03"
    assert normalize_date_string("2018") == "2018"
    assert normalize_date_string("Present") == "Present"
    assert normalize_date_string("Current") == "Present"


def test_confidence_calculation(mock_parsed_profile: ParsedProfile) -> None:
    source_text = (
        "Alex Mercer is in Seattle, WA. Email: alex.mercer@example.com, Phone: 555-019-2834. "
        "Senior Backend Engineer with 6+ years of experience designing high-throughput systems. "
        "CloudScale Inc. University of Washington. Python, FastAPI, Postgres."
    )
    confidences = compute_field_confidences(mock_parsed_profile, source_text)

    assert confidences["name"] >= 0.9
    assert confidences["email"] >= 0.95
    assert confidences["phone"] >= 0.9
    assert confidences["location"] >= 0.9
    assert confidences["experience"] >= 0.9
    assert confidences["education"] >= 0.9
    assert confidences["skills"] >= 0.8


def test_post_process_parsed_profile(mock_parsed_profile: ParsedProfile) -> None:
    source_text = "Alex Mercer, Seattle WA, alex.mercer@example.com, (555) 019-2834, CloudScale"
    processed = post_process_parsed_profile(mock_parsed_profile, source_text)

    # Experience date normalized
    assert processed.experience[0].start == "2021-01"
    assert processed.experience[0].end == "Present"

    # Skills normalized and deduplicated
    skill_names = [s.name for s in processed.skills]
    assert "Python" in skill_names
    assert "JavaScript" not in skill_names
    assert "Node.js" in skill_names
    assert processed.field_confidence["name"] >= 0.9


# ==============================================================================
# 5. Agent Pipeline and HTTP Endpoint Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_parse_resume_content_pipeline(
    single_col_pdf_bytes: bytes,
    mock_parsed_profile: ParsedProfile,
) -> None:
    with patch(
        "app.agents.resume_parser.generate_structured",
        new_callable=AsyncMock,
        return_value=mock_parsed_profile,
    ) as mock_llm:
        result = await parse_resume_content(
            file_bytes=single_col_pdf_bytes,
            filename="resume_single_column.pdf",
        )

        assert mock_llm.called
        assert result.profile.name == "Alex Mercer"
        assert result.profile.email == "alex.mercer@example.com"
        assert result.profile.field_confidence["name"] >= 0.9
        assert isinstance(result.warnings, list)


def test_api_parse_resume_endpoint_success(
    single_col_pdf_bytes: bytes,
    mock_parsed_profile: ParsedProfile,
) -> None:
    app = create_app()
    settings = get_settings()

    with patch(
        "app.agents.resume_parser.generate_structured",
        new_callable=AsyncMock,
        return_value=mock_parsed_profile,
    ):
        with TestClient(app) as client:
            response = client.post(
                "/v1/parse-resume",
                headers={"X-Service-Key": settings.ai_service_key},
                files={"file": ("resume.pdf", single_col_pdf_bytes, "application/pdf")},
            )

            assert response.status_code == 200
            data = response.json()
            assert "data" in data
            assert data["data"]["name"] == "Alex Mercer"
            assert data["data"]["email"] == "alex.mercer@example.com"
            assert "field_confidence" in data["data"]
            assert "warnings" in data
            assert "meta" in data
            assert data["meta"]["duration_ms"] > 0


def test_api_parse_resume_route_alias(
    single_col_pdf_bytes: bytes,
    mock_parsed_profile: ParsedProfile,
) -> None:
    app = create_app()
    settings = get_settings()

    with patch(
        "app.agents.resume_parser.generate_structured",
        new_callable=AsyncMock,
        return_value=mock_parsed_profile,
    ):
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/resume/parse",
                headers={"X-Service-Key": settings.ai_service_key},
                files={"file": ("resume.pdf", single_col_pdf_bytes, "application/pdf")},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["data"]["name"] == "Alex Mercer"


def test_api_parse_resume_scanned_pdf(
    scanned_pdf_bytes: bytes,
    mock_parsed_profile: ParsedProfile,
) -> None:
    app = create_app()
    settings = get_settings()

    with patch(
        "app.agents.resume_parser.generate_structured",
        new_callable=AsyncMock,
        return_value=mock_parsed_profile,
    ):
        with TestClient(app) as client:
            response = client.post(
                "/v1/parse-resume",
                headers={"X-Service-Key": settings.ai_service_key},
                files={"file": ("resume_scanned.pdf", scanned_pdf_bytes, "application/pdf")},
            )

            assert response.status_code == 200
            data = response.json()
            assert any("Scanned PDF detected" in w for w in data["warnings"])


def test_api_parse_resume_missing_auth(single_col_pdf_bytes: bytes) -> None:
    app = create_app()
    with TestClient(app) as client:
        response = client.post(
            "/v1/parse-resume",
            files={"file": ("resume.pdf", single_col_pdf_bytes, "application/pdf")},
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_api_parse_resume_invalid_file() -> None:
    app = create_app()
    settings = get_settings()
    with TestClient(app) as client:
        response = client.post(
            "/v1/parse-resume",
            headers={"X-Service-Key": settings.ai_service_key},
            files={"file": ("fake.pdf", b"Not a real PDF header", "application/pdf")},
        )
        assert response.status_code == 400
        error_json = response.json()
        assert error_json["error"]["code"] == "INVALID_FILE_TYPE"


# ==============================================================================
# 6. Audit Logging Security Tests (Hard Rule 6: Never Log PII)
# ==============================================================================


@pytest.mark.asyncio
async def test_no_resume_text_or_pii_logged(
    single_col_pdf_bytes: bytes,
    mock_parsed_profile: ParsedProfile,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)

    with patch(
        "app.agents.resume_parser.generate_structured",
        new_callable=AsyncMock,
        return_value=mock_parsed_profile,
    ):
        await parse_resume_content(
            file_bytes=single_col_pdf_bytes,
            filename="resume_single_column.pdf",
        )

    jobpilot_records = [r for r in caplog.records if r.name.startswith("jobpilot")]
    assert len(jobpilot_records) > 0

    for record in jobpilot_records:
        msg = record.getMessage()
        # Candidate name, email, phone, and resume body should never appear in application logs
        assert "Alex Mercer" not in msg
        assert "alex.mercer@example.com" not in msg
        assert "555-019-2834" not in msg
        assert "Architected and deployed microservices" not in msg
