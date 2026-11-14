from __future__ import annotations

import re
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class JobPosting(BaseModel):
    """Normalized job posting ingested from public API sources or user input."""

    source: str = Field(
        description="Source identifier (e.g., 'adzuna', 'arbeitnow', 'greenhouse', 'manual')",
        examples=["adzuna"],
    )
    external_id: str = Field(
        description="Unique identifier from the upstream job board",
        examples=["adzuna-job-98421"],
    )
    title: str = Field(
        description="Job position title",
        examples=["Senior AI Platform Engineer"],
    )
    company: str = Field(
        description="Hiring company name",
        examples=["Acme Robotics"],
    )
    location: str = Field(
        description="Geographic location or 'Remote'",
        examples=["San Francisco, CA"],
    )
    remote: bool | None = Field(
        default=None,
        description="Remote status (True: fully remote, False: onsite, None: unspecified/hybrid)",
        examples=[True],
    )
    salary_min: float | None = Field(
        default=None,
        ge=0.0,
        description="Minimum annualized salary",
        examples=[140000.0],
    )
    salary_max: float | None = Field(
        default=None,
        ge=0.0,
        description="Maximum annualized salary",
        examples=[180000.0],
    )
    currency: str | None = Field(
        default=None,
        description="Three-letter currency code (ISO 4217)",
        examples=["USD"],
    )
    description: str = Field(
        description="Complete raw job description text",
        examples=["We are seeking an experienced AI Platform Engineer..."],
    )
    url: str = Field(
        description="Original listing or direct application URL",
        examples=["https://jobs.example.com/posting/98421"],
    )
    posted_at: str | None = Field(
        default=None,
        description="ISO 8601 posting timestamp or date string",
        examples=["2026-11-01T12:00:00Z"],
    )
    skills_required: list[str] = Field(
        default_factory=list,
        description="Extracted or listed technical skills required for this role",
        examples=["Python", "FastAPI", "Kubernetes", "LLM APIs"],
    )
    seniority: str = Field(
        default="mid",
        description="Seniority level (e.g. entry, junior, mid, senior, lead, staff)",
        examples=["senior"],
    )
    is_demo: bool = Field(
        default=False,
        description="Flag indicating synthetic/demo data (only when USE_DEMO_JOBS is enabled)",
        examples=[False],
    )

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().upper()
        if not re.match(r"^[A-Z]{3}$", v):
            raise ValueError(f"Currency must be a 3-letter ISO code, got '{v}'")
        return v

    @model_validator(mode="after")
    def validate_salary_range(self) -> Self:
        if self.salary_min is not None and self.salary_max is not None:
            if self.salary_max < self.salary_min:
                raise ValueError(
                    f"salary_max ({self.salary_max}) cannot be less than "
                    f"salary_min ({self.salary_min})"
                )
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "source": "adzuna",
                "external_id": "adzuna-job-98421",
                "title": "Senior AI Platform Engineer",
                "company": "Acme Robotics",
                "location": "San Francisco, CA",
                "remote": True,
                "salary_min": 140000.0,
                "salary_max": 180000.0,
                "currency": "USD",
                "description": "We are seeking a Senior AI Platform Engineer...",
                "url": "https://jobs.example.com/posting/98421",
                "posted_at": "2026-11-01T12:00:00Z",
                "skills_required": ["Python", "FastAPI", "LLM APIs"],
                "seniority": "senior",
                "is_demo": False,
            }
        }
    )


class JobQuery(BaseModel):
    """Query parameters for searching jobs across sources."""

    keywords: str = Field(
        default="",
        description="Search keywords (role title, domain, or technology)",
        examples=["Full Stack Engineer"],
    )
    location: str | None = Field(
        default=None,
        description="Target location filter",
        examples=["San Francisco, CA"],
    )
    remote_only: bool = Field(
        default=False,
        description="Filter exclusively for remote opportunities",
        examples=[True],
    )
    seniority: str | None = Field(
        default=None,
        description="Desired seniority level (entry, junior, mid, senior, lead, staff)",
        examples=["senior"],
    )
    limit: int = Field(
        default=50,
        ge=1,
        le=200,
        description="Maximum merged postings to return",
        examples=[20],
    )
    sources: list[str] = Field(
        default_factory=list,
        description="List of specific sources to query (empty queries all active sources)",
        examples=[["remotive", "arbeitnow"]],
    )
    company_slugs: list[str] = Field(
        default_factory=list,
        description="Target company slugs for ATS boards (Greenhouse / Lever)",
        examples=[["airbnb", "stripe"]],
    )
    greenhouse_boards: list[str] = Field(
        default_factory=list,
        description="Specific Greenhouse company board slugs to query",
    )
    lever_boards: list[str] = Field(
        default_factory=list,
        description="Specific Lever company board slugs to query",
    )


class SourceStatus(BaseModel):
    """Status metadata for an individual job source queried."""

    source: str = Field(description="Name/identifier of the job source")
    status: str = Field(
        description="Query outcome: 'ok', 'error', or 'skipped'",
        examples=["ok"],
    )
    count: int = Field(
        default=0,
        ge=0,
        description="Number of raw job postings returned from this source",
    )
    error: str | None = Field(
        default=None,
        description="Error detail message if the source failed",
    )
    duration_ms: float = Field(
        default=0.0,
        ge=0.0,
        description="Execution duration in milliseconds",
    )


class SearchJobsResult(BaseModel):
    """Aggregated and deduped job search results with per-source telemetry."""

    jobs: list[JobPosting] = Field(
        default_factory=list,
        description="Merged, filtered, and deduplicated job postings",
    )
    total: int = Field(
        default=0,
        ge=0,
        description="Count of deduplicated jobs returned in payload",
    )
    sources_responded: int = Field(
        default=0,
        ge=0,
        description="Number of queried sources that returned successfully",
    )
    sources_total: int = Field(
        default=0,
        ge=0,
        description="Total number of sources queried in this execution",
    )
    source_statuses: list[SourceStatus] = Field(
        default_factory=list,
        description="Detailed per-source execution outcome",
    )
