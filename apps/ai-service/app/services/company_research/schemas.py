from __future__ import annotations

from pydantic import BaseModel, Field


class CompanyResearchLLMOutput(BaseModel):
    """Structured LLM synthesis model for company intelligence."""

    company_name: str = Field(
        description="Canonical or verified organization name",
    )
    summary: str = Field(
        description=(
            "Concise, factual company overview, mission, and business model supported strictly "
            "by evidence."
        ),
    )
    products_or_services: list[str] = Field(
        default_factory=list,
        description=(
            "Primary commercial products, platforms, or services explicitly described in evidence."
        ),
    )
    industry: str | None = Field(
        default=None,
        description="Primary industry or business domain.",
    )
    tech_stack: list[str] = Field(
        default_factory=list,
        description=(
            "Verified programming languages, frameworks, cloud providers, and developer "
            "tooling mentioned in evidence. Leave empty if not explicitly stated."
        ),
    )
    culture_signals: list[str] = Field(
        default_factory=list,
        description=(
            "Workplace culture, operational values, or team norms explicitly supported by "
            "evidence. Leave empty if not explicitly stated."
        ),
    )
    size_estimate: str | None = Field(
        default=None,
        description="Company headcount or size bracket if supported by evidence, else null.",
    )
    applicant_notes: list[str] = Field(
        default_factory=list,
        description=(
            "Crucial insights, hiring context, recent milestones, or interview notes relevant "
            "for prospective job applicants."
        ),
    )
    limitations: list[str] = Field(
        default_factory=list,
        description=(
            "Explicit gaps, missing facts, or unverified claims "
            "(e.g. 'Tech stack not found on public website')."
        ),
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score reflecting evidence completeness, clarity, and verification.",
    )
