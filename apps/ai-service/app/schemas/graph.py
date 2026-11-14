from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.job import JobPosting, JobQuery
from app.schemas.match import CandidatePreferences, RankingWeights
from app.schemas.profile import ParsedProfile

NodeStatus = Literal["queued", "running", "done", "failed", "skipped"]
GraphType = Literal["discovery", "prepare-application"]
RunStatus = Literal["queued", "running", "completed", "failed", "stopped"]


class ProgressEvent(BaseModel):
    """Progress event emitted by graph nodes and system lifecycle hooks."""

    run_id: str = Field(description="Unique run ID identifying the graph execution")
    node: str = Field(description="Node name within the graph or 'system'")
    status: NodeStatus = Field(description="State of the node execution")
    started_at: str | None = Field(default=None, description="ISO 8601 start timestamp")
    ended_at: str | None = Field(default=None, description="ISO 8601 completion timestamp")
    message: str = Field(default="", description="Descriptive progress or error message")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "run_id": "c1f7b830-4e2a-4db3-98fe-bc59fbe9a1e0",
                "node": "company_research",
                "status": "running",
                "started_at": "2026-11-14T10:00:00Z",
                "ended_at": None,
                "message": "Researching target company intelligence",
            }
        }
    )


class DiscoveryGraphRequest(BaseModel):
    """Request payload to initiate the discovery graph run."""

    profile: ParsedProfile | None = Field(
        default=None,
        description="Pre-verified profile. If provided, resume parsing is skipped.",
    )
    resume_bytes: str | None = Field(
        default=None,
        description="Base64 encoded resume file if profile is not provided",
    )
    resume_text: str | None = Field(
        default=None,
        description="Raw resume text if profile is not provided",
    )
    resume_filename: str = Field(
        default="resume.pdf",
        description="File name of the uploaded resume",
    )
    query: JobQuery = Field(
        description="Job search query specifying titles, locations, and options",
    )
    preferences: CandidatePreferences | None = Field(
        default=None,
        description="Optional ranking preferences",
    )
    weights: RankingWeights | None = Field(
        default=None,
        description="Optional scoring weights",
    )
    llm_rerank: bool = Field(
        default=False,
        description="Whether to perform LLM reranking",
    )
    run_id: str | None = Field(
        default=None,
        description="Optional predefined run ID (UUID generated if not supplied)",
    )


class DiscoveryGraphResponse(BaseModel):
    """Immediate response returned when a discovery run is scheduled."""

    run_id: str = Field(description="Run ID tracking the background discovery graph execution")
    graph_type: GraphType = Field(default="discovery")
    status: RunStatus = Field(default="queued")


class PrepareApplicationRequest(BaseModel):
    """Request payload to initiate the prepare-application graph run."""

    profile: ParsedProfile = Field(
        description="Verified candidate profile data",
    )
    job: JobPosting = Field(
        description="Target job opportunity posting",
    )
    company_name: str | None = Field(
        default=None,
        description="Target company name (defaults to job.company if omitted)",
    )
    company_website: str | None = Field(
        default=None,
        description="Target company website URL for intelligence gathering",
    )
    raw_context: str | None = Field(
        default=None,
        description="Additional untrusted company or role context",
    )
    run_id: str | None = Field(
        default=None,
        description="Optional predefined run ID (UUID generated if not supplied)",
    )


class PrepareApplicationResponse(BaseModel):
    """Immediate response returned when a prepare-application run is scheduled."""

    run_id: str = Field(description="Run ID tracking the background prepare-application execution")
    graph_type: GraphType = Field(default="prepare-application")
    status: RunStatus = Field(default="queued")


class ResumeGraphResponse(BaseModel):
    """Response returned when a paused/failed graph execution is resumed."""

    run_id: str = Field(description="Run ID that was resumed")
    status: RunStatus = Field(default="running")
    message: str = Field(default="Graph execution resumed successfully.")


class KillGraphResponse(BaseModel):
    """Response returned when a running graph execution is killed/stopped."""

    run_id: str = Field(description="Run ID that was stopped")
    status: RunStatus = Field(default="stopped")
    message: str = Field(default="Graph execution killed successfully.")


class GraphRunSnapshot(BaseModel):
    """Snapshot representation of graph execution state and events history."""

    run_id: str
    graph_type: GraphType
    status: RunStatus
    node_status: dict[str, str] = Field(default_factory=dict)
    errors: dict[str, str] = Field(default_factory=dict)
    events: list[ProgressEvent] = Field(default_factory=list)
    state: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
