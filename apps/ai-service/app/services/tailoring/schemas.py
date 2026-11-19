from __future__ import annotations

from pydantic import BaseModel, Field


class JobAnalysisOutput(BaseModel):
    """Enriched structured analysis of target job posting."""

    required_skills: list[str] = Field(default_factory=list, description="Explicitly required skills")
    preferred_skills: list[str] = Field(default_factory=list, description="Preferred or bonus skills")
    responsibilities: list[str] = Field(default_factory=list, description="Core day-to-day responsibilities")
    seniority: str = Field(default="Mid-Level", description="Detected seniority level (Junior, Mid, Senior, Lead)")
    keywords: list[str] = Field(default_factory=list, description="Domain and technical keywords from job posting")


class SummaryRewriteOutput(BaseModel):
    """Chunked output for professional summary rewriting."""

    tailored_summary: str = Field(description="Tailored summary preserving strictly verified candidate background")
    source_ref: str = Field(default="profile.summary", description="Pointer to source summary")
    reason: str = Field(description="Strategic justification for positioning")


class SkillsOrderingOutput(BaseModel):
    """Chunked output for prioritizing verified candidate skills."""

    prioritized_skills: list[str] = Field(description="Permutation of candidate verified skills prioritized for role")
    reason: str = Field(default="Prioritized skills matching target requirements", description="Ordering rationale")


class BulletRewriteItem(BaseModel):
    """Single rewritten experience bullet point."""

    source_ref: str = Field(description="Pointer to original bullet, e.g. 'profile.experience[0].bullets[1]'")
    text: str = Field(description="Rephrased bullet preserving verified facts and numbers")
    reason: str = Field(description="Keyword alignment explanation")


class ExperienceRewriteOutput(BaseModel):
    """Chunked output for rewriting one experience employer's bullets."""

    bullets: list[BulletRewriteItem] = Field(description="Rewritten bullets for this employment entry")


class ProjectBulletRewriteItem(BaseModel):
    """Single rewritten project accomplishment bullet."""

    source_ref: str = Field(description="Pointer to source bullet, e.g. 'profile.projects[0].bullets[1]'")
    text: str = Field(description="Rephrased bullet preserving verified metrics, numbers, and facts")
    reason: str = Field(description="Strategic justification explaining keyword/impact alignment")


class ProjectRewriteOutput(BaseModel):
    """Chunked output for rewriting a single project preserving context line and individual bullets."""

    context_line: str | None = Field(default=None, description="Metadata context line from source")
    bullets: list[ProjectBulletRewriteItem] = Field(
        default_factory=list,
        description="Rewritten accomplishment bullets (never collapsed into single paragraph)",
    )
    description: str = Field(default="", description="Overview or fallback description")
    source_ref: str = Field(default="profile.projects", description="Pointer to source project")
    reason: str = Field(default="Aligned project achievements with target requirements", description="Tailoring rationale")


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
    """Project entry with tailored bullets and context line."""

    name: str = Field(description="Project name (must match source)")
    context_line: str | None = Field(default=None, description="Preserved context line")
    description: str = Field(default="", description="Overview or fallback description")
    bullets: list[RewrittenBullet] = Field(
        default_factory=list,
        description="Individual accomplishment bullets preserving quantified metrics",
    )
    source_fact_ref: str = Field(
        default="profile.projects",
        description="Reference pointer to original project",
    )
    technologies: list[str] = Field(
        default_factory=list,
        description="Technologies from source project",
    )
    url: str | None = Field(default=None, description="Project URL from source")
    reason: str = Field(
        default="Aligned project description with target role requirements.",
        description="Rationale for project tailoring",
    )


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
