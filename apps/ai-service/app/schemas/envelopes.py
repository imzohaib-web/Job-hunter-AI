from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

from app.schemas.company import CompanyInsight
from app.schemas.cover_letter import CoverLetter
from app.schemas.fabrication import FabricationReport
from app.schemas.interview import InterviewPack
from app.schemas.job import JobPosting, SearchJobsResult
from app.schemas.match import MatchResult, RankResponseData
from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import TailoredResume

T = TypeVar("T")


def generate_request_id() -> str:
    return str(uuid.uuid4())


def get_current_utc() -> str:
    return datetime.now(UTC).isoformat()


class ApiMeta(BaseModel):
    """Metadata envelope included with every AI service response."""

    request_id: str = Field(
        default_factory=generate_request_id,
        description="Unique request tracing identifier",
        examples=["b4a5309d-f663-42e1-881b-5638cbbde381"],
    )
    duration_ms: float = Field(
        default=0.0,
        ge=0.0,
        description="Server-side processing duration in milliseconds",
        examples=[412.5],
    )
    timestamp: str = Field(
        default_factory=get_current_utc,
        description="ISO 8601 UTC timestamp of response generation",
        examples=["2026-11-11T20:30:00Z"],
    )


class ApiResponse(BaseModel, Generic[T]):
    """Standard success response wrapper."""

    data: T = Field(description="Payload data")
    warnings: list[str] = Field(default_factory=list, description="Processing warnings and notices")
    meta: ApiMeta = Field(default_factory=ApiMeta, description="Execution metadata and timing")


class ParseResumeRequest(BaseModel):
    """Request payload for resume extraction."""

    resume_text: str = Field(
        min_length=1,
        description="Raw resume text extracted from PDF or DOCX",
        examples=["Jane Doe\nAI Engineer\nExperience at TechCorp..."],
    )


class ParseResumeResponse(ApiResponse[ParsedProfile]):
    """Response containing structured parsed profile."""


class SearchJobsResponse(ApiResponse[SearchJobsResult]):
    """Response containing aggregated and deduped job listings with source telemetry."""


class MatchJobRequest(BaseModel):
    """Request payload for single job qualification scoring."""

    profile: ParsedProfile = Field(description="Parsed candidate profile")
    job: JobPosting = Field(description="Target job posting")


class MatchJobResponse(ApiResponse[MatchResult]):
    """Response containing match evaluation score and rationale."""


class BatchMatchRequest(BaseModel):
    """Request payload for ranking multiple job opportunities."""

    profile: ParsedProfile = Field(description="Candidate profile")
    jobs: list[JobPosting] = Field(min_length=1, description="List of job postings to evaluate")


class BatchMatchResponse(ApiResponse[list[MatchResult]]):
    """Response containing match rankings for all provided jobs."""


class RankResponse(ApiResponse[RankResponseData]):
    """Response containing hybrid ranked job opportunities with score breakdowns."""


class CompanyResearchRequest(BaseModel):
    """Request payload for company intelligence gathering."""

    company_name: str = Field(
        min_length=1,
        description="Name of the company to analyze",
        examples=["Acme Robotics"],
    )
    raw_context: str | None = Field(
        default=None,
        description="Optional scraped text, job description snippet, or press releases",
    )


class CompanyResearchResponse(ApiResponse[CompanyInsight]):
    """Response containing researched company intelligence."""


class TailorResumeRequest(BaseModel):
    """Request payload for resume tailoring."""

    profile: ParsedProfile = Field(description="Source candidate profile")
    job: JobPosting = Field(description="Target job posting")
    company_insight: CompanyInsight | None = Field(
        default=None,
        description="Optional company research insight",
    )


class TailorResumeResponse(ApiResponse[TailoredResume]):
    """Response containing tailored resume and ATS report."""


class ExportResumeDocxRequest(BaseModel):
    """Request payload for exporting verified resume to ATS-friendly DOCX format."""

    resume: ParsedProfile = Field(description="Approved candidate profile / resume sections")
    target_job_title: str | None = Field(
        default=None,
        description="Optional target job title for document naming",
    )


class CheckFabricationRequest(BaseModel):
    """Request payload for truthfulness and hallucination audit."""

    tailored_text: str = Field(
        min_length=1,
        description="Generated resume or cover letter text to audit",
    )
    original_profile: ParsedProfile = Field(
        description="Original verified source profile",
    )


class CheckFabricationResponse(ApiResponse[FabricationReport]):
    """Response containing truthfulness audit results."""


class GenerateCoverLetterRequest(BaseModel):
    """Request payload for cover letter generation."""

    profile: ParsedProfile = Field(description="Candidate profile")
    job: JobPosting = Field(description="Target job posting")
    tone: str = Field(
        default="professional",
        description="Desired tone of voice (e.g. professional, enthusiastic, conversational)",
        examples=["professional"],
    )


class GenerateCoverLetterResponse(ApiResponse[CoverLetter]):
    """Response containing grounded cover letter."""


class GenerateInterviewPackRequest(BaseModel):
    """Request payload for personalized interview preparation generation."""

    profile: ParsedProfile = Field(description="Candidate profile")
    job: JobPosting = Field(description="Target job posting")


class GenerateInterviewPackResponse(ApiResponse[InterviewPack]):
    """Response containing customized behavioral and technical interview questions."""
