from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.llm.base import LLMProviderError
from app.llm.client import LLMClient
from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience
from app.services.company_research.agent import CompanyResearchAgent
from app.services.tailoring.agent import ResumeTailorAgent
from app.services.tailoring.schemas import (
    JobAnalysisOutput,
    ResumeRewriteLLMOutput,
    RewrittenBullet,
    RewrittenExperience,
    SkillsOrderingOutput,
    SummaryRewriteOutput,
)


def create_candidate() -> ParsedProfile:
    return ParsedProfile(
        name="Alex Mercer",
        summary="Experienced Full-Stack Developer specialized in React and Node.js.",
        skills=[
            ProfileSkill(name="React", category="Frontend"),
            ProfileSkill(name="Node.js", category="Backend"),
            ProfileSkill(name="TypeScript", category="Languages"),
        ],
        experience=[
            WorkExperience(
                company="TechCorp",
                title="Full-Stack Developer",
                start="2022-01",
                end="Present",
                bullets=[
                    "Engineered web applications using React and Node.js.",
                    "Improved API throughput with indexing.",
                ],
                technologies=["React", "Node.js", "PostgreSQL"],
            )
        ],
    )


def create_job() -> JobPosting:
    return JobPosting(
        source="internal",
        external_id="job-999",
        title="Full-Stack Developer",
        company="InnoTech",
        location="Remote",
        skills_required=["React", "Node.js", "TypeScript"],
        description="Seeking full-stack developer with React and Node.js experience.",
        url="",
    )


# ---------------------------------------------------------------------------
# (a) Poisoned rewrite inventing "Kubernetes" and "40% faster" is caught & reverted
# ---------------------------------------------------------------------------
def test_poisoned_rewrite_reverts_unsupported_facts() -> None:
    candidate = create_candidate()
    agent = ResumeTailorAgent(llm_client=AsyncMock())

    # Candidate source profile only has React, Node.js, PostgreSQL, and NO metrics like 40%
    original_bullets = candidate.experience[0].bullets

    # Poisoned rewrite output from LLM inventing "Kubernetes" and "40% faster"
    draft_rewrite = ResumeRewriteLLMOutput(
        tailored_summary="Experienced Full-Stack Developer specialized in React and Node.js.",
        summary_source_fact_ref="profile.summary",
        summary_reason="Preserved",
        experience=[
            RewrittenExperience(
                company="TechCorp",
                title="Full-Stack Developer",
                start="2022-01",
                end="Present",
                bullets=[
                    RewrittenBullet(
                        text="Deployed microservices on Kubernetes using React and Node.js.",
                        source_fact_ref="profile.experience[0].bullets[0]",
                        reason="Added cloud infrastructure keyword",
                    ),
                    RewrittenBullet(
                        text="Optimized API throughput by 40% faster with database indexing.",
                        source_fact_ref="profile.experience[0].bullets[1]",
                        reason="Added quantified metric",
                    ),
                ],
                technologies=["React", "Node.js"],
            )
        ],
        projects=[],
        skills_to_highlight=["React", "Node.js"],
    )

    guarded, reverted = agent.run_deterministic_guard(
        original_profile=candidate,
        draft_rewrite=draft_rewrite,
    )

    # Both bullets must be caught and reverted to original phrasing!
    assert len(reverted) >= 2
    reverted_texts = [r.text for r in reverted]
    assert any("Kubernetes" in t for t in reverted_texts)
    assert any("40%" in t for t in reverted_texts)

    # Guarded output must match original bullets exactly
    assert guarded.experience[0].bullets[0].text == original_bullets[0]
    assert guarded.experience[0].bullets[1].text == original_bullets[1]


# ---------------------------------------------------------------------------
# (b) LLM times out -> node fails with clear message within timeout, does not hang
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_llm_timeout_fails_gracefully() -> None:
    candidate = create_candidate()
    job = create_job()

    mock_llm = AsyncMock()

    # Simulate timeout error on structured call
    async def timeout_side_effect(*args, **kwargs):
        raise asyncio.TimeoutError("LLM call exceeded 30s timeout")

    mock_llm.generate_structured.side_effect = timeout_side_effect

    agent = ResumeTailorAgent(llm_client=mock_llm)

    with pytest.raises(TimeoutError) as exc_info:
        await agent.tailor_resume(
            candidate_profile=candidate,
            target_job=job,
            company_insights=None,
        )

    assert "exceeded" in str(exc_info.value).lower() or "timeout" in str(exc_info.value).lower()


# ---------------------------------------------------------------------------
# (c) 429 handling with Retry-After immediately switches provider without sleeping
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_rate_limit_429_provider_fallback() -> None:
    with patch("app.llm.client.settings") as mock_settings:
        mock_settings.llm_provider = "groq"
        mock_settings.groq_api_key = "test_groq_key"
        mock_settings.gemini_api_key = "test_gemini_key"
        mock_settings.ai_concurrency_limit = 5

        client = LLMClient()

        # Mock groq provider raising 429
        mock_groq = AsyncMock()
        mock_groq.generate_structured.side_effect = LLMProviderError(
            provider="groq",
            message="Rate limit hit: 429",
            retry_after=10.0,
        )

        # Mock gemini provider succeeding
        mock_gemini = AsyncMock()
        mock_gemini.generate_structured.return_value = JobAnalysisOutput(
            required_skills=["React", "Node.js"],
            preferred_skills=[],
            responsibilities=[],
            seniority="Mid",
            keywords=["React", "Node.js"],
        )

        client._groq = mock_groq
        client._gemini = mock_gemini

        start_time = asyncio.get_event_loop().time()
        result = await client.generate_structured(
            prompt_template="Analyze job",
            output_model=JobAnalysisOutput,
        )
        elapsed = asyncio.get_event_loop().time() - start_time

        # Must succeed via fallback to Gemini immediately without sleeping for 10s!
        assert result.seniority == "Mid"
        assert elapsed < 1.0
        # Groq must be in cooldown
        assert "groq" in client._provider_cooldowns


# ---------------------------------------------------------------------------
# (d) Profile with empty bullets does not crash
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_profile_with_empty_bullets_does_not_crash() -> None:
    candidate = ParsedProfile(
        name="Empty Bullets Candidate",
        summary="A developer with sparse bullets.",
        skills=[ProfileSkill(name="Python", category="Languages")],
        experience=[
            WorkExperience(
                company="Startup Inc",
                title="Software Engineer",
                start="2020-01",
                end="2021-01",
                bullets=[],  # Empty bullets list!
                technologies=[],
            )
        ],
    )
    job = create_job()

    mock_llm = AsyncMock()
    mock_llm.generate_structured.side_effect = [
        JobAnalysisOutput(
            required_skills=["Python"],
            preferred_skills=[],
            responsibilities=[],
            seniority="Mid",
            keywords=["Python"],
        ),
        SummaryRewriteOutput(
            tailored_summary="A Python developer.",
            reason="Aligned",
        ),
        SkillsOrderingOutput(
            ordered_skills=["Python"],
            reason="Aligned",
        ),
    ]

    agent = ResumeTailorAgent(llm_client=mock_llm)
    tailored = await agent.tailor_resume(
        candidate_profile=candidate,
        target_job=job,
        company_insights=None,
    )

    # Pipeline should complete cleanly without throwing an unhandled IndexError/KeyError
    assert tailored is not None
    assert tailored.sections.experience[0].bullets == []


# ---------------------------------------------------------------------------
# (e) Company research with no URL returns skipped with reason
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_company_research_no_url_returns_skipped() -> None:
    job = JobPosting(
        source="job-board",
        external_id="ext-1",
        title="Software Engineer",
        company="Private Stealth Co",
        location="Remote",
        description="Stealth startup hiring developers.",
        url="",  # No URL, un-derivable domain
    )

    with patch("app.services.company_research.agent.settings") as mock_settings:
        mock_settings.serper_api_key = None  # No search API configured

        agent = CompanyResearchAgent(llm_client=AsyncMock())
        insight = await agent.research_company(
            company_name=job.company,
            job_url=job.url,
            force_refresh=True,
        )

        assert insight is not None
        assert getattr(insight, "_skipped", False) is True
        assert "no company website found" in getattr(insight, "_skip_message", "").lower()
