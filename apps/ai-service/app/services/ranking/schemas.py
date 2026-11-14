from __future__ import annotations

from pydantic import BaseModel, Field


class JobRerankItem(BaseModel):
    """Structured evaluation and adjustment for a single job posting from LLM."""

    job_id: str = Field(description="Identifier of the evaluated job posting")
    score_adjustment: int = Field(
        ge=-8,
        le=8,
        description="Integer score adjustment bounded between -8 and +8",
    )
    adjustment_reason: str = Field(
        description="Specific technical justification for adjusting the score",
    )
    explanation: str = Field(
        max_length=400,
        description="1-2 sentence assessment of match quality and alignment (max 400 chars)",
    )
    strengths: list[str] = Field(
        default_factory=list,
        description="Top 1-3 candidate technical or domain strengths for this role",
    )
    gaps: list[str] = Field(
        default_factory=list,
        description="Top 1-3 missing skills, tooling, or domain qualification gaps",
    )
    suggestion: str = Field(
        description="Short actionable recommendation for candidate application or interview prep",
    )


class RerankBatchOutput(BaseModel):
    """Container for batch LLM rerank results."""

    evaluations: list[JobRerankItem] = Field(
        default_factory=list,
        description="List of structured evaluations for top candidates",
    )
