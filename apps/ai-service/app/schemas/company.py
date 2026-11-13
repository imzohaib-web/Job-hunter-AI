from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CompanyInsight(BaseModel):
    """Researched insights and background intelligence regarding the hiring organization."""

    summary: str = Field(
        description="Comprehensive summary of company mission and business model",
        examples=["Series B robotics and AI startup specializing in warehouse logistics."],
    )
    tech_stack: list[str] = Field(
        default_factory=list,
        description="Primary engineering tech stack, frameworks, and infrastructure",
        examples=["Python", "FastAPI", "React", "AWS", "Kubernetes", "PyTorch"],
    )
    culture_signals: list[str] = Field(
        default_factory=list,
        description="Observed engineering values and workplace cultural signals",
        examples=["Fast-paced agile environment", "Async-first communication"],
    )
    size_estimate: str | None = Field(
        default=None,
        description="Estimated team or company headcount bracket",
        examples=["50-150 employees"],
    )
    sources: list[str] = Field(
        default_factory=list,
        description="Public URLs or documentation sources referenced",
        examples=["https://company.example.com/about", "https://github.com/company-org"],
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score for the gathered insights between 0.0 and 1.0",
        examples=[0.88],
    )

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        if not (0.0 <= v <= 1.0):
            raise ValueError(f"Confidence score must be between 0.0 and 1.0, got {v}")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "summary": "Series B robotics and AI startup specializing in warehouse logistics.",
                "tech_stack": ["Python", "FastAPI", "AWS", "Kubernetes"],
                "culture_signals": ["High ownership", "Remote-friendly"],
                "size_estimate": "50-150 employees",
                "sources": ["https://acme.example.com"],
                "confidence": 0.88,
            }
        }
    )
