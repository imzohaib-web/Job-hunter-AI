from __future__ import annotations

import io

from docx import Document

from app.schemas.profile import Education, ParsedProfile, ProfileSkill, WorkExperience
from app.services.tailoring.docx_builder import build_docx_resume


def test_build_docx_resume_generates_valid_ats_doc() -> None:
    profile = ParsedProfile(
        name="Jordan Lee",
        email="jordan.lee@example.com",
        phone="+1-555-0144",
        location="Austin, TX",
        links=["https://github.com/jordanlee"],
        summary="Senior AI Engineer focused on production LLM infrastructure and microservices.",
        skills=[
            ProfileSkill(name="Python", category="Languages"),
            ProfileSkill(name="FastAPI", category="Frameworks"),
            ProfileSkill(name="Docker", category="Cloud"),
        ],
        experience=[
            WorkExperience(
                company="VectorAI",
                title="Lead Backend Engineer",
                start="2022-01",
                end="Present",
                bullets=[
                    "Spearheaded low-latency inference routing serving 10M requests daily.",
                    "Reduced operational cloud expenditure by 28% via container right-sizing.",
                ],
                technologies=["Python", "FastAPI", "Docker"],
            )
        ],
        education=[
            Education(
                institution="University of Texas at Austin",
                degree="Bachelor of Science",
                field_of_study="Computer Science",
                end="2021",
            )
        ],
    )

    stream = build_docx_resume(profile, target_job_title="Senior AI Platform Engineer")

    assert isinstance(stream, io.BytesIO)
    assert stream.getbuffer().nbytes > 0

    # Verify docx file structure and expected sections
    doc = Document(stream)
    text_content = [p.text for p in doc.paragraphs if p.text.strip()]
    full_text = "\n".join(text_content)

    # Name and target role
    assert "Jordan Lee" in full_text
    assert "Senior AI Platform Engineer" in full_text

    # Contact line
    assert "jordan.lee@example.com" in full_text
    assert "Austin, TX" in full_text

    # Section Headings
    assert "PROFESSIONAL SUMMARY" in full_text
    assert "PROFESSIONAL EXPERIENCE" in full_text
    assert "EDUCATION" in full_text

    # Content verification
    assert "VectorAI" in full_text
    assert "Lead Backend Engineer" in full_text
    assert "Spearheaded low-latency inference routing" in full_text
    assert "University of Texas at Austin" in full_text
