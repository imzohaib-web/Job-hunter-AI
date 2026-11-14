from __future__ import annotations

import time

import pytest

from app.schemas.job import JobPosting
from app.schemas.match import CandidatePreferences, JobWithEmbedding, RankingWeights
from app.schemas.profile import (
    ParsedProfile,
    ProfileSkill,
    WorkExperience,
)
from app.services.ranking.agent import HybridRankingAgent


def create_fixed_candidate_profile() -> ParsedProfile:
    return ParsedProfile(
        name="Elena Rostova",
        summary=(
            "Senior AI & Backend Engineer with 5 years experience building "
            "Python microservices, FastAPI endpoints, LLM agent architectures, "
            "and PostgreSQL data stores."
        ),
        location="San Francisco, CA",
        skills=[
            ProfileSkill(name="Python", category="Languages", years=5.0),
            ProfileSkill(name="FastAPI", category="Frameworks", years=4.0),
            ProfileSkill(name="PostgreSQL", category="Databases", years=5.0),
            ProfileSkill(name="Docker", category="DevOps", years=4.0),
            ProfileSkill(name="LLM", category="AI", years=2.0),
            ProfileSkill(name="LangChain", category="AI", years=2.0),
            ProfileSkill(name="PyTorch", category="AI", years=3.0),
        ],
        experience=[
            WorkExperience(
                company="AI Core Systems",
                title="Senior AI Engineer",
                start="2021-01",
                end="Present",
                bullets=[
                    "Engineered FastAPI microservices handling 5k rps",
                    "Built production RAG pipelines using LangChain and vector databases",
                ],
                technologies=["Python", "FastAPI", "Docker", "PostgreSQL", "LLM"],
            ),
            WorkExperience(
                company="DataForge",
                title="Backend Developer",
                start="2019-06",
                end="2020-12",
                bullets=["Developed asynchronous APIs and PostgreSQL databases"],
                technologies=["Python", "PostgreSQL"],
            ),
        ],
    )


def create_20_sample_jobs() -> list[JobPosting]:
    jobs: list[JobPosting] = []

    # 1-3: High Matches (Python, FastAPI, LLM, Remote)
    jobs.append(
        JobPosting(
            source="remotive",
            external_id="job-high-1",
            title="Senior Python / AI Platform Engineer",
            company="NeuralLabs AI",
            location="Remote",
            remote=True,
            skills_required=["Python", "FastAPI", "LLM", "Docker"],
            description=(
                "We are seeking a Senior AI Platform Engineer. Requirements: 4+ years with "
                "Python, FastAPI, and LLM orchestration. Docker and PostgreSQL experience."
            ),
            seniority="senior",
            url="https://example.com/1",
        )
    )
    jobs.append(
        JobPosting(
            source="greenhouse",
            external_id="job-high-2",
            title="Senior Backend Engineer - AI Systems",
            company="Aether Cloud",
            location="San Francisco, CA",
            remote=True,
            skills_required=["Python", "FastAPI", "PostgreSQL"],
            description=(
                "Build scalable backend services for AI agents. Must have 4+ years of Python, "
                "FastAPI, and relational database expertise."
            ),
            seniority="senior",
            url="https://example.com/2",
        )
    )
    jobs.append(
        JobPosting(
            source="lever",
            external_id="job-high-3",
            title="Senior Python Developer (RAG & Agents)",
            company="Cognitive Soft",
            location="Remote",
            remote=True,
            skills_required=["Python", "LangChain", "PyTorch"],
            description=(
                "Design and deploy modern LLM and RAG pipelines using LangChain, PyTorch, "
                "and Python. 3-5 years required."
            ),
            seniority="senior",
            url="https://example.com/3",
        )
    )

    # 4-6: Moderate Matches
    jobs.append(
        JobPosting(
            source="arbeitnow",
            external_id="job-mid-4",
            title="Full Stack Python / React Developer",
            company="WebPlatform Co",
            location="Remote",
            remote=True,
            skills_required=["Python", "React", "TypeScript"],
            description="Build modern web applications using Python backends and React frontends.",
            seniority="mid",
            url="https://example.com/4",
        )
    )
    jobs.append(
        JobPosting(
            source="adzuna",
            external_id="job-mid-5",
            title="Data Platform Engineer",
            company="DataScale",
            location="San Francisco, CA",
            remote=True,
            skills_required=["Python", "PostgreSQL", "Kafka"],
            description="Scale our database and streaming pipelines with Python and PostgreSQL.",
            seniority="mid",
            url="https://example.com/5",
        )
    )
    jobs.append(
        JobPosting(
            source="remotive",
            external_id="job-mid-6",
            title="Backend DevOps Engineer",
            company="InfraCloud",
            location="Remote",
            remote=True,
            skills_required=["Docker", "Kubernetes", "Python"],
            description="Maintain cloud infra with Docker, Kubernetes, and Python scripts.",
            seniority="senior",
            url="https://example.com/6",
        )
    )

    # 7-10: Low / Unrelated Matches
    for idx, (title, comp, tech) in enumerate(
        [
            ("Senior Java Spring Developer", "Enterprise Solutions", "Java"),
            ("Frontend Engineer (Vue.js)", "Creative Studio", "Vue"),
            ("iOS Mobile Engineer", "AppVibe", "Swift"),
            ("Embedded Systems Firmware C++", "HardwareCore", "C++"),
        ],
        start=7,
    ):
        jobs.append(
            JobPosting(
                source="remotive",
                external_id=f"job-low-{idx}",
                title=title,
                company=comp,
                location="Remote",
                remote=True,
                skills_required=[tech],
                description=f"Core responsibilities around {tech} development.",
                seniority="senior",
                url=f"https://example.com/{idx}",
            )
        )

    # 11-15: Additional tech roles
    for idx, title in enumerate(
        [
            ("Ruby on Rails Specialist", "RailsShop"),
            ("PHP Laravel Web Architect", "LegacyWeb"),
            ("C# .NET Enterprise Engineer", "FinCorp Systems"),
            ("Junior QA Automation Engineer", "TestMatrix"),
            ("Associate Technical Writer", "DocuTech"),
        ],
        start=11,
    ):
        jobs.append(
            JobPosting(
                source="arbeitnow",
                external_id=f"job-other-{idx}",
                title=title[0],
                company=title[1],
                location="Remote",
                remote=True,
                skills_required=[],
                description="Technical support and cross-functional collaboration.",
                seniority="mid",
                url=f"https://example.com/{idx}",
            )
        )

    # 16-20: Hard Filter Failures
    # 16: Excluded company
    jobs.append(
        JobPosting(
            source="manual",
            external_id="job-fail-company",
            title="Senior Python AI Engineer",
            company="BadVibe Technologies Inc",
            location="Remote",
            remote=True,
            skills_required=["Python", "FastAPI"],
            description="Python engineer position.",
            seniority="senior",
            url="https://example.com/16",
        )
    )
    # 17: Excluded keyword (crypto)
    jobs.append(
        JobPosting(
            source="manual",
            external_id="job-fail-keyword",
            title="Crypto Blockchain Protocol Engineer",
            company="TokenMoon",
            location="Remote",
            remote=True,
            skills_required=["Python"],
            description="Build decentralized crypto protocols.",
            seniority="senior",
            url="https://example.com/17",
        )
    )
    # 18: Non-remote in London when candidate requires remote or SF
    jobs.append(
        JobPosting(
            source="manual",
            external_id="job-fail-location",
            title="Onsite Backend Developer",
            company="London Tech Ltd",
            location="London, UK",
            remote=False,
            skills_required=["Python"],
            description="Onsite attendance required every day in Central London office.",
            seniority="mid",
            url="https://example.com/18",
        )
    )
    # 19: Experience gap beyond tolerance (requires 12+ years, candidate has 5)
    jobs.append(
        JobPosting(
            source="manual",
            external_id="job-fail-exp-gap",
            title="Distinguished VP Principal Architect",
            company="MegaCorp",
            location="Remote",
            remote=True,
            skills_required=["Python"],
            description="Requires 12+ years of experience leading engineering organizations.",
            seniority="principal",
            url="https://example.com/19",
        )
    )
    # 20: Strict work authorization (no sponsorship)
    jobs.append(
        JobPosting(
            source="manual",
            external_id="job-fail-visa",
            title="Python Defense Engineer",
            company="Defense Dynamics",
            location="Remote",
            remote=True,
            skills_required=["Python"],
            description="Active clearance required. Must be US Citizen. No visa sponsorship.",
            seniority="senior",
            url="https://example.com/20",
        )
    )

    return jobs


@pytest.mark.asyncio
async def test_hybrid_ranking_20_jobs_performance_and_ordering() -> None:
    profile = create_fixed_candidate_profile()
    jobs = create_20_sample_jobs()
    job_inputs = [JobWithEmbedding(job=j) for j in jobs]

    prefs = CandidatePreferences(
        excluded_companies=["BadVibe"],
        excluded_keywords=["crypto"],
        work_authorization="Needs Sponsorship",
        remote_only=True,
        experience_gap_tolerance_years=2.0,
    )

    agent = HybridRankingAgent()

    # Model is loaded once at service startup as per spec
    from app.embeddings.model import get_embedding_model

    get_embedding_model()

    # Measure execution time
    t0 = time.perf_counter()
    result = await agent.rank_jobs(
        profile=profile,
        jobs=job_inputs,
        preferences=prefs,
        weights=RankingWeights(),
        llm_rerank=False,  # deterministic baseline benchmark
    )
    elapsed_seconds = time.perf_counter() - t0

    # 1. Performance constraint: ranking 20 jobs returns in under 15 seconds!
    assert elapsed_seconds < 15.0, f"Ranking took too long: {elapsed_seconds:.2f}s"
    assert result.total == 20

    # 2. Check hard filter partitioning
    assert result.hard_filtered_count == 5
    assert result.unfiltered_count == 15

    # 3. High match jobs should be ranked at the very top
    top_3_ids = [item.match.job_id for item in result.ranked_jobs[:3]]
    assert "job-high-1" in top_3_ids or "job-high-2" in top_3_ids or "job-high-3" in top_3_ids
    top_score = result.ranked_jobs[0].match.overall_score
    assert top_score >= 70, f"Top job score too low: {top_score}"

    # 4. Hard-filter failed jobs must be at the bottom with hard_filter_failed=True
    failed_items = result.ranked_jobs[15:]
    assert len(failed_items) == 5
    for item in failed_items:
        assert item.match.hard_filter_failed is True
        assert item.match.hard_filter_reason is not None
        assert item.match.overall_score <= 20

    # 5. Score ranges and breakdowns valid
    for item in result.ranked_jobs:
        b = item.match.breakdown
        assert 0.0 <= b.semantic <= 100.0
        assert 0.0 <= b.keyword <= 100.0
        assert 0.0 <= b.skills <= 100.0
        assert 0.0 <= b.experience <= 100.0
        assert 0.0 <= b.location <= 100.0
        assert 0 <= item.match.overall_score <= 100
        assert len(item.match.explanation) > 0


@pytest.mark.asyncio
async def test_embedding_cache_reuse() -> None:
    profile = create_fixed_candidate_profile()
    jobs = create_20_sample_jobs()[:3]

    # Pre-populate embedding for job 0
    fake_embedding = [0.1] * 384
    job_inputs = [
        JobWithEmbedding(job=jobs[0], embedding=fake_embedding),
        JobWithEmbedding(job=jobs[1], embedding=None),
        JobWithEmbedding(job=jobs[2], embedding=None),
    ]

    agent = HybridRankingAgent()
    result = await agent.rank_jobs(profile=profile, jobs=job_inputs, llm_rerank=False)

    # 1 was cached, 2 newly generated
    assert result.new_embeddings_generated == 2
    # Verify embeddings are returned in result
    assert result.ranked_jobs[0].embedding is not None
    assert len(result.ranked_jobs[0].embedding) == 384
