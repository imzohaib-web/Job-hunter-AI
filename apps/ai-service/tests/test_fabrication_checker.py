from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience
from app.services.tailoring.fabrication_checker import FabricationChecker
from app.services.tailoring.schemas import (
    ClaimAudit,
    FabricationAuditLLMOutput,
    ResumeRewriteLLMOutput,
    RewrittenBullet,
    RewrittenExperience,
)


def create_verified_profile() -> ParsedProfile:
    return ParsedProfile(
        name="Alex Morgan",
        summary="Python developer with 4 years building backend APIs using FastAPI and PostgreSQL.",
        skills=[
            ProfileSkill(name="Python", category="Languages", years=4.0),
            ProfileSkill(name="FastAPI", category="Frameworks", years=3.0),
            ProfileSkill(name="PostgreSQL", category="Databases", years=3.0),
        ],
        experience=[
            WorkExperience(
                company="Nexus Systems",
                title="Backend Developer",
                start="2020-01",
                end="Present",
                bullets=[
                    "Built asynchronous microservices with FastAPI and Python.",
                    "Improved API response times by 30% via caching.",
                ],
                technologies=["Python", "FastAPI", "PostgreSQL"],
            )
        ],
    )


@pytest.mark.asyncio
async def test_deterministic_catches_invented_tool_and_metrics() -> None:
    profile = create_verified_profile()

    # Poisoned tailored resume: adds "Kubernetes" (tool) and "99.9% uptime" (metric)
    poisoned_tailored = ResumeRewriteLLMOutput(
        tailored_summary="Experienced Python and Kubernetes engineer maintaining 99.9% uptime.",
        summary_source_fact_ref="profile.summary",
        summary_reason="Highlighting target role keywords.",
        experience=[
            RewrittenExperience(
                company="Nexus Systems",
                title="Backend Developer",
                start="2020-01",
                end="Present",
                bullets=[
                    RewrittenBullet(
                        text="Orchestrated Kubernetes clusters with 99.9% uptime.",
                        source_fact_ref="profile.experience[0].bullets[0]",
                        reason="Adding orchestration experience.",
                    )
                ],
                technologies=["Python", "FastAPI", "Kubernetes"],
            )
        ],
        projects=[],
        skills_to_highlight=["Python", "Kubernetes"],
    )

    # Checker with dummy LLM client that returns clean (so only deterministic fires)
    mock_llm = AsyncMock()
    mock_llm.generate_structured.return_value = FabricationAuditLLMOutput(
        claims_checked=2,
        claims=[
            ClaimAudit(claim_text="Python", location="summary", is_supported=True),
        ],
    )

    checker = FabricationChecker(llm_client=mock_llm)
    report = await checker.audit_tailored_resume(profile, poisoned_tailored)

    # Must fail fabrication audit!
    assert report.passed is False
    assert len(report.unsupported_claims) >= 2

    flagged_reasons = " ".join(c.reason or "" for c in report.unsupported_claims)
    flagged_texts = " ".join(c.text for c in report.unsupported_claims)

    assert "Kubernetes" in flagged_texts or "Kubernetes" in flagged_reasons
    assert "99.9%" in flagged_texts or "99.9%" in flagged_reasons


@pytest.mark.asyncio
async def test_deterministic_catches_invented_employer_and_modified_dates() -> None:
    profile = create_verified_profile()

    # Poisoned employer and dates
    poisoned = ResumeRewriteLLMOutput(
        tailored_summary="Python developer with FastAPI experience.",
        summary_source_fact_ref="profile.summary",
        summary_reason="Align with job.",
        experience=[
            RewrittenExperience(
                company="Google Inc",  # Invented company!
                title="Backend Developer",
                start="2018-01",  # Modified date!
                end="2022-01",
                bullets=[
                    RewrittenBullet(
                        text="Built microservices using Python.",
                        source_fact_ref="profile.experience[0].bullets[0]",
                        reason="Unaltered bullet",
                    )
                ],
                technologies=["Python"],
            )
        ],
        projects=[],
        skills_to_highlight=["Python"],
    )

    mock_llm = AsyncMock()
    mock_llm.generate_structured.return_value = FabricationAuditLLMOutput(
        claims_checked=0, claims=[]
    )

    checker = FabricationChecker(llm_client=mock_llm)
    report = await checker.audit_tailored_resume(profile, poisoned)

    assert report.passed is False
    flagged_texts = " ".join(c.text for c in report.unsupported_claims)
    assert "Google Inc" in flagged_texts


@pytest.mark.asyncio
async def test_fake_llm_flagging_unsupported_claim() -> None:
    """Test requirement: an independent LLM audit that catches made-up claims."""
    profile = create_verified_profile()

    tailored = ResumeRewriteLLMOutput(
        tailored_summary="Python and FastAPI developer.",
        summary_source_fact_ref="profile.summary",
        summary_reason="Clean summary",
        experience=[
            RewrittenExperience(
                company="Nexus Systems",
                title="Backend Developer",
                start="2020-01",
                end="Present",
                bullets=[
                    RewrittenBullet(
                        text="Spearheaded overhaul leading team of 15 engineers.",
                        source_fact_ref="profile.experience[0].bullets[0]",
                        reason="Enhanced leadership impact",
                    )
                ],
                technologies=["Python"],
            )
        ],
        projects=[],
        skills_to_highlight=["Python", "FastAPI"],
    )

    # Independent LLM auditor spots exaggerated leadership claim
    mock_llm = AsyncMock()
    mock_llm.generate_structured.return_value = FabricationAuditLLMOutput(
        claims_checked=5,
        claims=[
            ClaimAudit(claim_text="Python", location="summary", is_supported=True),
            ClaimAudit(
                claim_text="Leading 15 engineers across architectural overhaul",
                location="experience[0].bullets[0]",
                is_supported=False,
                unsupported_reason="Profile indicates individual contributor without management.",
            ),
        ],
    )

    checker = FabricationChecker(llm_client=mock_llm)
    report = await checker.audit_tailored_resume(profile, tailored)

    assert report.passed is False
    assert any("15 engineers" in c.text for c in report.unsupported_claims)
