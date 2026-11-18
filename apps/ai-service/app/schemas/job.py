from __future__ import annotations

import re
from typing import Any, Self

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
    employment_type: str | None = Field(
        default=None,
        description="Employment type (full-time, part-time, contract, internship, freelance)",
        examples=["full-time"],
    )
    company_size: str | None = Field(
        default=None,
        description="Company size classification (startup, mid, large)",
        examples=["startup"],
    )
    industry: str | None = Field(
        default=None,
        description="Industry or domain",
        examples=["AI/ML"],
    )
    is_demo: bool = Field(
        default=False,
        description="Flag indicating synthetic/demo data (only when USE_DEMO_JOBS is enabled)",
        examples=[False],
    )
    location_badge: str | None = Field(
        default=None,
        description="User-facing formatted location badge (e.g., 'Remote (worldwide)', 'Remote (France)')",
    )
    duplicate_locations: list[str] = Field(
        default_factory=list,
        description="Additional regions/locations this exact role is also posted for",
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
    target_titles: list[str] = Field(
        default_factory=list,
        description="Target job titles (multi-select)",
        examples=[["Full Stack Engineer", "AI Engineer"]],
    )
    employment_types: list[str] = Field(
        default_factory=list,
        description="Employment types: full-time, part-time, contract, internship, freelance",
        examples=[["full-time", "contract"]],
    )
    experience_levels: list[str] = Field(
        default_factory=list,
        description="Experience levels: internship, entry, mid, senior, lead",
        examples=[["mid", "senior"]],
    )
    work_modes: list[str] = Field(
        default_factory=list,
        description="Work modes: remote, hybrid, on-site",
        examples=[["remote", "hybrid"]],
    )
    locations: list[Any] = Field(
        default_factory=list,
        description="Target locations (country, city, or strings)",
        examples=[[{"country": "US", "city": "San Francisco"}]],
    )
    open_to_relocation: bool = Field(
        default=False,
        description="Whether user is open to relocation",
    )
    remote_worldwide: bool = Field(
        default=False,
        description="Whether user is looking for remote worldwide positions",
    )
    visa_sponsorship_needed: bool = Field(
        default=False,
        description="Whether visa sponsorship / work authorization is needed",
    )
    preferred_countries: list[str] = Field(
        default_factory=list,
        description="Preferred countries for sponsorship / relocation",
        examples=[["US", "DE", "UK"]],
    )
    salary_currency: str = Field(
        default="USD",
        description="Salary currency ISO code",
    )
    salary_min: float | None = Field(
        default=None,
        ge=0.0,
        description="Minimum target salary",
        examples=[120000.0],
    )
    salary_period: str = Field(
        default="yearly",
        description="Salary period (monthly or yearly)",
    )
    hide_without_salary: bool = Field(
        default=False,
        description="Hide jobs that do not disclose salary",
    )
    must_have_skills: list[str] = Field(
        default_factory=list,
        description="Mandatory skills required in matches",
        examples=[["Python", "FastAPI"]],
    )
    nice_to_have_skills: list[str] = Field(
        default_factory=list,
        description="Optional preferred skills",
        examples=[["Docker", "Kubernetes"]],
    )
    industries: list[str] = Field(
        default_factory=list,
        description="Target industries/domains (fintech, healthtech, AI/ML, etc.)",
        examples=[["AI/ML", "Fintech"]],
    )
    company_sizes: list[str] = Field(
        default_factory=list,
        description="Target company sizes: startup, mid, large",
        examples=[["startup", "mid"]],
    )
    date_posted: str = Field(
        default="all",
        description="Posting freshness filter: 24h, 3d, 7d, 30d, all",
        examples=["7d"],
    )
    excluded_keywords: list[str] = Field(
        default_factory=list,
        description="Keywords to filter out from job titles/descriptions",
        examples=[["crypto", "wordpress"]],
    )
    excluded_companies: list[str] = Field(
        default_factory=list,
        description="Companies to exclude from results",
        examples=[["SpamCorp"]],
    )
    role_families: list[str] = Field(
        default_factory=list,
        description="Role families to include (software, data/AI, etc.)",
        examples=[["software", "data/AI"]],
    )
    also_show_other_roles: bool = Field(
        default=False,
        description="Whether to also show roles outside the primary families (defaults to False)",
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
        description="Number of filtered job postings kept from this source",
    )
    raw_fetched: int = Field(
        default=0,
        ge=0,
        description="Number of raw job postings fetched before local filtering",
    )
    after_dedupe: int = Field(
        default=0,
        ge=0,
        description="Count after deduplication",
    )
    after_local_filters: int = Field(
        default=0,
        ge=0,
        description="Count after aggregator local filtering",
    )
    query_sent: str = Field(
        default="",
        description="Query string or parameters sent to the upstream provider",
    )
    http_status: int | None = Field(
        default=None,
        description="HTTP response status code from upstream API (e.g. 200, 403, 404)",
    )
    error: str | None = Field(
        default=None,
        description="Error detail message if the source failed or was skipped",
    )
    duration_ms: float = Field(
        default=0.0,
        ge=0.0,
        description="Execution duration in milliseconds",
    )
    local_filters_applied: list[str] = Field(
        default_factory=list,
        description="Filters applied locally by aggregator for this source",
    )
    filter_breakdown: dict[str, int] = Field(
        default_factory=dict,
        description="Per-filter breakdown of jobs removed by each filter criterion",
    )


class SearchDiagnostics(BaseModel):
    """Observability diagnostics for job discovery and ranking stages."""

    sources: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
        description="Per-source diagnostic metrics (query_sent, http_status, raw_fetched, etc.)",
    )
    raw_fetched: int = Field(default=0, description="Total raw jobs fetched across all sources")
    after_dedupe: int = Field(default=0, description="Total jobs after deduplication")
    after_local_filters: int = Field(default=0, description="Total jobs after local filters")
    preselected: int = Field(default=0, description="Total candidate jobs pre-selected for embedding/ranking")
    candidate_cap: int | None = Field(default=None, description="Explicit candidate cap if applied")
    truncated_by: str | None = Field(default=None, description="Reason or stage for any candidate reduction")
    after_hard_filters: int = Field(default=0, description="Total jobs passing hard constraints")
    ranked: int = Field(default=0, description="Total ranked matches produced")
    main_filter_removed: str | None = Field(default=None, description="Primary constraint that removed jobs")
    filter_breakdown: dict[str, int] = Field(
        default_factory=dict,
        description="Total breakdown of jobs removed per filter criterion",
    )
    fallback_used: bool = Field(default=False, description="Whether adaptive relaxation fallback was triggered")
    fallback_stage: str = Field(default="strict", description="Fallback stage: strict, broad_soft_relaxed, broad_family_relaxed")
    timings: dict[str, float] = Field(default_factory=dict, description="Stage timings in seconds")


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
    diagnostics: SearchDiagnostics | None = Field(
        default=None,
        description="Comprehensive discovery pipeline diagnostics and filter dropouts",
    )
