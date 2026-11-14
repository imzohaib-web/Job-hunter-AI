from __future__ import annotations

from pydantic import BaseModel, Field


class RewrittenBullet(BaseModel):
    """Specific bullet point rewritten for alignment with target role."""

    text: str = Field(description="Tailored bullet text preserving original verified facts")
    source_fact_ref: str = Field(
        description="Exact reference pointer (e.g. 'profile.experience[0].bullets[1]')"
    )
    reason: str = Field(description="Strategic justification explaining keyword/impact alignment")


class RewrittenExperience(BaseModel):
    """Work experience entry with tailored bullet points."""

    company: str = Field(description="Employer name (must exactly match source)")
    title: str = Field(description="Job title (must exactly match source)")
    start: str = Field(description="Start date/period from source")
    end: str | None = Field(default=None, description="End date/period from source")
    bullets: list[RewrittenBullet] = Field(description="Rewritten bullet points")
    technologies: list[str] = Field(
        default_factory=list,
        description="Relevant technologies from source role",
    )


class RewrittenProject(BaseModel):
    """Project entry with tailored description."""

    name: str = Field(description="Project name (must match source)")
    description: str = Field(description="Tailored project description preserving verified facts")
    source_fact_ref: str = Field(
        description="Reference pointer to original project (e.g. 'profile.projects[0].description')"
    )
    technologies: list[str] = Field(
        default_factory=list,
        description="Technologies from source project",
    )
    url: str | None = Field(default=None, description="Project URL from source")


class ResumeRewriteLLMOutput(BaseModel):
    """Structured response from LLM resume rewriting pass."""

    tailored_summary: str = Field(
        description="Tailored professional headline/summary grounded strictly in source profile"
    )
    summary_source_fact_ref: str = Field(
        default="profile.summary",
        description="Pointer to original summary or key skills reference",
    )
    summary_reason: str = Field(
        description="Strategic justification explaining target job positioning"
    )
    experience: list[RewrittenExperience] = Field(
        default_factory=list,
        description="Rephrased experience entries with source references",
    )
    projects: list[RewrittenProject] = Field(
        default_factory=list,
        description="Tailored project descriptions",
    )
    skills_to_highlight: list[str] = Field(
        default_factory=list,
        description="Prioritized subset of verified candidate skills most relevant to target job",
    )


class ClaimAudit(BaseModel):
    """Factual claim extracted and verified by independent auditor."""

    claim_text: str = Field(description="Specific statement, metric, skill, or claim evaluated")
    location: str = Field(
        description="Section or field where claim appears (e.g. 'experience[0].bullets[1]')"
    )
    is_supported: bool = Field(
        description="True if directly corroborated by source profile facts, False if unsupported"
    )
    unsupported_reason: str | None = Field(
        default=None,
        description="Explicit rationale explaining why claim lacks source evidence",
    )


class FabricationAuditLLMOutput(BaseModel):
    """Structured response from independent LLM fabrication verification pass."""

    claims_checked: int = Field(ge=0, description="Total number of factual claims audited")
    claims: list[ClaimAudit] = Field(
        default_factory=list,
        description="Comprehensive audit of each extracted claim",
    )
