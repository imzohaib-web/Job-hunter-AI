from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience
from app.services.tailoring.agent import ResumeTailorAgent
from app.services.tailoring.schemas import (
    ClaimAudit,
    FabricationAuditLLMOutput,
    ResumeRewriteLLMOutput,
    RewrittenBullet,
    RewrittenExperience,
)


def create_sample_candidate() -> ParsedProfile:
    return ParsedProfile(
        name="Marcus Vance",
        summary="Backend Python engineer with 4 years experience with FastAPI and PostgreSQL.",
        skills=[
            ProfileSkill(name="Python", category="Languages"),
            ProfileSkill(name="FastAPI", category="Frameworks"),
            ProfileSkill(name="PostgreSQL", category="Databases"),
            ProfileSkill(name="Docker", category="DevOps"),
        ],
        experience=[
            WorkExperience(
                company="Apex Solutions",
                title="Software Engineer",
                start="2021-01",
                end="Present",
                bullets=[
                    "Built microservices with FastAPI and Python.",
                    "Improved database query latency by 25%.",
                ],
                technologies=["Python", "FastAPI", "PostgreSQL"],
            )
        ],
    )


def create_sample_job() -> JobPosting:
    return JobPosting(
        source="remotive",
        external_id="job-101",
        title="Senior Python Backend Developer",
        company="CloudScale",
        location="Remote",
        remote=True,
        skills_required=["Python", "FastAPI", "Kubernetes"],
        description="We are seeking a Python and FastAPI engineer. Kubernetes is a plus.",
        url="https://example.com/job/101",
    )


@pytest.mark.asyncio
async def test_tailor_agent_clean_pipeline_with_diffs() -> None:
    candidate = create_sample_candidate()
    job = create_sample_job()

    clean_rewrite = ResumeRewriteLLMOutput(
        tailored_summary="Results-driven Python and FastAPI backend developer.",
        summary_source_fact_ref="profile.summary",
        summary_reason="Aligning with CloudScale focus on FastAPI.",
        experience=[
            RewrittenExperience(
                company="Apex Solutions",
                title="Software Engineer",
                start="2021-01",
                end="Present",
                bullets=[
                    RewrittenBullet(
                        text="Engineered asynchronous microservices using Python and FastAPI.",
                        source_fact_ref="profile.experience[0].bullets[0]",
                        reason="Elevated FastAPI keyword requested in job posting.",
                    ),
                    RewrittenBullet(
                        text="Improved database query latency by 25%.",
                        source_fact_ref="profile.experience[0].bullets[1]",
                        reason="Preserved verified query optimization achievement.",
                    ),
                ],
                technologies=["Python", "FastAPI", "PostgreSQL"],
            )
        ],
        projects=[],
        skills_to_highlight=["FastAPI", "Python", "PostgreSQL"],
    )

    mock_llm = AsyncMock()
    mock_llm.generate_structured.side_effect = [
        # 1. First call: rewrite
        clean_rewrite,
        # 2. Second call: independent audit
        FabricationAuditLLMOutput(
            claims_checked=4,
            claims=[
                ClaimAudit(claim_text="Python and FastAPI", location="summary", is_supported=True),
                ClaimAudit(
                    claim_text="25% latency reduction",
                    location="experience[0].bullets[1]",
                    is_supported=True,
                ),
            ],
        ),
    ]

    agent = ResumeTailorAgent(llm_client=mock_llm)
    result = await agent.tailor_resume(candidate, job)

    assert result.fabrication_report.passed is True
    assert len(result.fabrication_report.unsupported_claims) == 0

    # Verify changes list contains before/after diffs
    assert len(result.changes) >= 1
    bullet_change = next((c for c in result.changes if c.section == "experience"), None)
    assert bullet_change is not None
    assert bullet_change.before == "Built microservices with FastAPI and Python."
    assert bullet_change.after == "Engineered asynchronous microservices using Python and FastAPI."
    assert bullet_change.source_fact_ref == "profile.experience[0].bullets[0]"

    # Verify keyword plan reports Kubernetes as a gap
    gap_item = next((item for item in result.keyword_plan if item.keyword == "Kubernetes"), None)
    assert gap_item is not None
    assert gap_item.is_gap is True
    assert gap_item.evidence is None


@pytest.mark.asyncio
async def test_tailor_agent_flags_poisoned_output_and_returns_diff() -> None:
    """Prompt 8 success criteria: deliberately poisoned output flagged and diff returned."""
    candidate = create_sample_candidate()
    job = create_sample_job()

    # Poisoned rewrite: fake LLM injects made-up skill 'Quantum Computing' and hallucinated '99.99%'
    poisoned_rewrite = ResumeRewriteLLMOutput(
        tailored_summary="Python developer with Quantum Computing achieving 99.99% uptime.",
        summary_source_fact_ref="profile.summary",
        summary_reason="Poisoned fake skill injection.",
        experience=[
            RewrittenExperience(
                company="Apex Solutions",
                title="Software Engineer",
                start="2021-01",
                end="Present",
                bullets=[
                    RewrittenBullet(
                        text="Engineered Quantum Computing microservices with 99.99% reliability.",
                        source_fact_ref="profile.experience[0].bullets[0]",
                        reason="Injecting fake skill",
                    )
                ],
                technologies=["Python", "FastAPI"],
            )
        ],
        projects=[],
        skills_to_highlight=["Python", "Quantum Computing"],
    )

    mock_llm = AsyncMock()
    # Return poisoned output on both initial try and retry attempt
    mock_llm.generate_structured.side_effect = [
        poisoned_rewrite,  # initial rewrite
        # Independent LLM audit flagging hallucinated skills
        FabricationAuditLLMOutput(
            claims_checked=3,
            claims=[
                ClaimAudit(
                    claim_text="Quantum Computing expertise",
                    location="summary",
                    is_supported=False,
                    unsupported_reason="Candidate profile does not contain Quantum Computing.",
                )
            ],
        ),
        poisoned_rewrite,  # retried rewrite (still poisoned)
        FabricationAuditLLMOutput(
            claims_checked=3,
            claims=[
                ClaimAudit(
                    claim_text="Quantum Computing expertise",
                    location="summary",
                    is_supported=False,
                    unsupported_reason="Candidate profile does not contain Quantum Computing.",
                )
            ],
        ),
    ]

    agent = ResumeTailorAgent(llm_client=mock_llm)
    result = await agent.tailor_resume(candidate, job)

    # 1. Deliberately poisoned test output must be flagged (passed=False)
    assert result.fabrication_report.passed is False
    assert len(result.fabrication_report.unsupported_claims) >= 1

    flagged_text = " ".join(c.text for c in result.fabrication_report.unsupported_claims)
    assert "99.99%" in flagged_text or "Quantum Computing" in flagged_text

    # 2. The changes[] diff list must still be returned for user review
    assert isinstance(result.changes, list)
    assert len(result.changes) >= 1
    summary_change = next((c for c in result.changes if c.section == "summary"), None)
    assert summary_change is not None
    assert summary_change.before == candidate.summary
    assert "99.99%" in summary_change.after or "Quantum Computing" in summary_change.after
