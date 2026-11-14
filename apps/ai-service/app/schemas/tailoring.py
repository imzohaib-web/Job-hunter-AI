from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.fabrication import FabricationReport
from app.schemas.profile import ParsedProfile


class KeywordPlanItem(BaseModel):
    """Extracted job keyword mapped to candidate evidence or identified gap."""

    keyword: str = Field(description="Target keyword or technology required by the job")
    category: str = Field(
        default="required",
        description="Priority category ('required' or 'preferred')",
        examples=["required"],
    )
    evidence: str | None = Field(
        default=None,
        description="Pointer or excerpt of verified profile evidence, or None if gap",
        examples=["profile.experience[0].bullets[0]"],
    )
    is_gap: bool = Field(
        default=False,
        description="True if keyword is missing from candidate source profile",
        examples=[False],
    )


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
    length_check: str = Field(
        default="Optimal: 1-2 pages",
        description="Length and word count assessment for ATS parsing",
        examples=["Optimal: 1-2 pages (520 words)"],
    )
    word_count: int = Field(
        default=0,
        ge=0,
        description="Total words in candidate resume body",
        examples=[520],
    )
    formatting_warnings: list[str] = Field(
        default_factory=list,
        description="ATS layout warnings (tables, images, columns, etc.)",
        examples=[
            "Single-column ATS layout verified: no multi-column tables or embedded images used."
        ],
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
    keyword_plan: list[KeywordPlanItem] = Field(
        default_factory=list,
        description="Audit mapping of job keywords to verified evidence or reported gaps",
    )
    ats_report: AtsReport = Field(
        description="ATS optimization analysis and keyword matching metrics",
    )
    fabrication_report: FabricationReport = Field(
        default_factory=lambda: FabricationReport(
            claims_checked=0,
            unsupported_claims=[],
            passed=True,
        ),
        description="Independent fabrication and truthfulness audit report",
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
