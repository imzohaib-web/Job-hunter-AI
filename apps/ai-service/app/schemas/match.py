from __future__ import annotations

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MatchScoreBreakdown(BaseModel):
    """Detailed breakdown of constituent scoring dimensions."""

    semantic: float = Field(
        ge=0.0,
        le=100.0,
        description="Embedding-based semantic similarity score (0-100)",
        examples=[85.5],
    )
    keyword: float = Field(
        ge=0.0,
        le=100.0,
        description="BM25 / lexical keyword matching score (0-100)",
        examples=[78.0],
    )
    skills: float = Field(
        ge=0.0,
        le=100.0,
        description="Overlap between candidate skills and required skills (0-100)",
        examples=[90.0],
    )
    experience: float = Field(
        ge=0.0,
        le=100.0,
        description="Seniority and years-of-experience alignment (0-100)",
        examples=[82.0],
    )
    location: float = Field(
        ge=0.0,
        le=100.0,
        description="Location compatibility and remote policy fit (0-100)",
        examples=[100.0],
    )


class MatchResult(BaseModel):
    """Evaluated match between a parsed candidate profile and a job posting."""

    job_id: str = Field(
        description="Identifier of the evaluated job posting",
        examples=["adzuna-job-98421"],
    )
    overall_score: int = Field(
        ge=0,
        le=100,
        description="Composite overall match score from 0 to 100",
        examples=[84],
    )
    breakdown: MatchScoreBreakdown = Field(description="Component score breakdown")
    matched_skills: list[str] = Field(
        default_factory=list,
        description="Skills candidate possesses that the job posting requires",
        examples=["Python", "FastAPI", "Docker"],
    )
    missing_skills: list[str] = Field(
        default_factory=list,
        description="Important skills requested by the job that the candidate lacks",
        examples=["Kubernetes", "GraphQL"],
    )
    explanation: str = Field(
        max_length=400,
        description="Concise rationale explaining the match score fit (max 400 chars)",
        examples=[
            "Strong match for backend AI engineering with FastAPI experience. "
            "Lacks explicit Kubernetes cluster administration."
        ],
    )
    hard_filter_failed: bool = Field(
        default=False,
        description="Whether a non-negotiable hard criterion failed (e.g. location/visa)",
        examples=[False],
    )
    hard_filter_reason: str | None = Field(
        default=None,
        description="Explanation if a hard filter failed",
        examples=[None],
    )

    @field_validator("explanation")
    @classmethod
    def validate_explanation_length(cls, v: str) -> str:
        if len(v) > 400:
            raise ValueError(
                f"Explanation exceeds maximum allowed length of 400 characters (got {len(v)})"
            )
        return v

    @model_validator(mode="after")
    def validate_hard_filter(self) -> Self:
        if self.hard_filter_failed and not self.hard_filter_reason:
            raise ValueError("hard_filter_reason must be provided when hard_filter_failed is True")
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "job_id": "adzuna-job-98421",
                "overall_score": 84,
                "breakdown": {
                    "semantic": 85.5,
                    "keyword": 78.0,
                    "skills": 90.0,
                    "experience": 82.0,
                    "location": 100.0,
                },
                "matched_skills": ["Python", "FastAPI"],
                "missing_skills": ["Kubernetes"],
                "explanation": "Strong match for AI platform work with FastAPI.",
                "hard_filter_failed": False,
                "hard_filter_reason": None,
            }
        }
    )
