from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.profile import ParsedProfile


class ResumeChange(BaseModel):
    """Specific edit or rephrasing applied during resume tailoring."""

    section: str = Field(
        description="Target resume section modified (e.g., 'summary', 'experience', 'skills')",
        examples=["experience"],
    )
    before: str = Field(
        description="Original bullet or text phrasing before tailoring",
        examples=["Worked on backend services and Python scripts."],
    )
    after: str = Field(
        description="Tailored phrasing highlighting relevant keywords and quantifiable impact",
        examples=["Engineered low-latency Python microservices with FastAPI for 10k DAU."],
    )
    reason: str = Field(
        description="Strategic justification explaining alignment with target job requirements",
        examples=["Elevates FastAPI keywords requested in job posting requirements."],
    )
    source_fact_ref: str = Field(
        description="Reference to verified candidate fact confirming no fabrication occurred",
        examples=["profile.experience[0].bullets[1]"],
    )

    @field_validator("source_fact_ref")
    @classmethod
    def validate_source_ref(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError(
                "source_fact_ref cannot be empty (Hard rule: no invented facts allowed)"
            )
        return v


class AtsSectionCheck(BaseModel):
    """ATS diagnostic check result for a specific resume section."""

    section: str = Field(description="Section evaluated", examples=["skills"])
    status: str = Field(
        description="Status flag: 'pass', 'warning', or 'fail'",
        examples=["pass"],
    )
    feedback: str = Field(
        description="Actionable diagnostic feedback for ATS readability and keyword density",
        examples=["Strong alignment with core ML frameworks."],
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in {"pass", "warning", "fail"}:
            raise ValueError(f"Status must be one of 'pass', 'warning', 'fail', got '{v}'")
        return v


class AtsReport(BaseModel):
    """Comprehensive ATS compatibility assessment."""

    keyword_coverage: float = Field(
        ge=0.0,
        le=100.0,
        description="Percentage of core job keywords represented (0-100)",
        examples=[88.5],
    )
    missing_keywords: list[str] = Field(
        default_factory=list,
        description="High-value target keywords that are still missing",
        examples=["Kubernetes", "Prometheus"],
    )
    section_checks: list[AtsSectionCheck] = Field(
        default_factory=list,
        description="Per-section diagnostic audit findings",
    )


class TailoredResume(BaseModel):
    """Complete tailored resume output with auditable diffs and ATS reporting."""

    sections: ParsedProfile = Field(
        description="Full structured candidate profile with tailored text modifications",
    )
    changes: list[ResumeChange] = Field(
        default_factory=list,
        description="Itemized list of all rephrased bullets and text changes",
    )
    ats_report: AtsReport = Field(
        description="ATS optimization analysis and keyword matching metrics",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "sections": {
                    "name": "Jane Doe",
                    "email": "jane.doe@example.com",
                    "summary": "Tailored AI Engineer headline.",
                    "skills": [],
                    "experience": [],
                    "education": [],
                    "projects": [],
                    "certifications": [],
                    "languages": [],
                    "field_confidence": {},
                },
                "changes": [
                    {
                        "section": "experience",
                        "before": "Built Python apps",
                        "after": "Architected production FastAPI pipelines",
                        "reason": "Align with job focus on FastAPI",
                        "source_fact_ref": "profile.experience[0].bullets[0]",
                    }
                ],
                "ats_report": {
                    "keyword_coverage": 88.5,
                    "missing_keywords": ["Kubernetes"],
                    "section_checks": [
                        {
                            "section": "experience",
                            "status": "pass",
                            "feedback": "Clear impact metrics present.",
                        }
                    ],
                },
            }
        }
    )
