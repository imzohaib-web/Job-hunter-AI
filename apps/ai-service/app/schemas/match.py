from __future__ import annotations

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile


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
    strengths: list[str] = Field(
        default_factory=list,
        description="Key strengths matching the candidate to this position",
    )
    gaps: list[str] = Field(
        default_factory=list,
        description="Identified candidate qualification gaps or missing criteria",
    )
    suggestion: str | None = Field(
        default=None,
        description="Short actionable recommendation for the candidate application",
    )
    score_adjustment: int = Field(
        default=0,
        ge=-8,
        le=8,
        description="LLM score adjustment bounded within [-8, +8] points",
    )
    adjustment_reason: str | None = Field(
        default=None,
        description="Justification for LLM score adjustment",
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


class RankingWeights(BaseModel):
    """Configurable scoring weights summing to 1.0."""

    semantic: float = Field(
        default=0.35,
        ge=0.0,
        le=1.0,
        description="Weight for dense embedding similarity",
    )
    keyword: float = Field(
        default=0.20,
        ge=0.0,
        le=1.0,
        description="Weight for BM25 lexical keyword score",
    )
    skills: float = Field(
        default=0.30,
        ge=0.0,
        le=1.0,
        description="Weight for skill overlap score",
    )
    experience: float = Field(
        default=0.15,
        ge=0.0,
        le=1.0,
        description="Weight for seniority and experience gap score",
    )


class CandidatePreferences(BaseModel):
    """Candidate constraints and preferences for deterministic hard filtering."""

    location: str | None = Field(
        default=None,
        description="Preferred geographic location or country",
        examples=["San Francisco, CA"],
    )
    remote_only: bool = Field(
        default=False,
        description="Strictly require fully remote roles",
        examples=[True],
    )
    excluded_companies: list[str] = Field(
        default_factory=list,
        description="Companies the candidate wishes to exclude",
        examples=[["Acme Corp"]],
    )
    excluded_keywords: list[str] = Field(
        default_factory=list,
        description="Keywords to exclude from job titles or descriptions",
        examples=[["crypto", "gambling"]],
    )
    work_authorization: str | None = Field(
        default=None,
        description="Work authorization status (e.g., 'US Citizen', 'Needs Sponsorship')",
        examples=["Needs Sponsorship"],
    )
    experience_gap_tolerance_years: float = Field(
        default=2.0,
        ge=0.0,
        description="Tolerated gap in years between candidate experience and role requirement",
        examples=[2.0],
    )


class JobWithEmbedding(BaseModel):
    """Job posting optionally accompanied by pre-computed embedding."""

    job: JobPosting = Field(description="Normalized job posting")
    embedding: list[float] | None = Field(
        default=None,
        description="Cached 384-dim vector embedding from MongoDB Atlas or client",
    )


class RankRequest(BaseModel):
    """Request payload for hybrid job ranking against a parsed profile."""

    profile: ParsedProfile = Field(description="Candidate profile")
    jobs: list[JobWithEmbedding] = Field(
        min_length=1,
        description="Job postings to evaluate, optionally with cached embeddings",
    )
    preferences: CandidatePreferences = Field(
        default_factory=CandidatePreferences,
        description="Candidate constraints and hard filter rules",
    )
    llm_rerank: bool = Field(
        default=True,
        description="Enable LLM reranking and explanation for top 15 candidates",
    )
    weights: RankingWeights = Field(
        default_factory=RankingWeights,
        description="Documented stage 4 weights",
    )


class RankedJobItem(BaseModel):
    """Evaluated job entry with match analysis and vector embedding."""

    job: JobPosting = Field(description="Job posting details")
    match: MatchResult = Field(description="Match evaluation score and breakdown")
    embedding: list[float] | None = Field(
        default=None,
        description="Embedding vector (returned for persistence in MongoDB Atlas)",
    )


class RankResponseData(BaseModel):
    """Output data containing ordered job matches and telemetry."""

    ranked_jobs: list[RankedJobItem] = Field(
        description="Ranked jobs (top matches first; hard filter failures at the end)",
    )
    total: int = Field(ge=0, description="Total number of evaluated jobs")
    unfiltered_count: int = Field(
        ge=0,
        description="Count of jobs successfully passing hard filters",
    )
    hard_filtered_count: int = Field(
        ge=0,
        description="Count of jobs failing hard filters",
    )
    new_embeddings_generated: int = Field(
        ge=0,
        description="Number of newly computed vector embeddings",
    )
