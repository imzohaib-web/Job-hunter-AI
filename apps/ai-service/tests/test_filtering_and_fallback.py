from __future__ import annotations

import asyncio
import pytest
from app.schemas.job import JobPosting, JobQuery
from app.schemas.match import CandidatePreferences, JobWithEmbedding
from app.schemas.profile import ParsedProfile, ProfileSkill
from app.services.job_sources.aggregator import (
    JobSourceAggregator,
    is_role_family_match,
)
from app.services.job_sources.base import JobSource
from app.services.job_sources.greenhouse import GreenhouseBoardSource
from app.services.job_sources.lever import LeverBoardSource
from app.services.ranking.agent import HybridRankingAgent


# 40 fixed fake jobs
def create_40_fake_jobs() -> list[JobPosting]:
    jobs: list[JobPosting] = []

    # 25 Tech jobs
    tech_specs = [
        ("React Frontend Developer", "Acme", "Remote", True, "junior", "full-time", ["React", "JavaScript", "TypeScript"]),
        ("Python ML Engineer", "AI Corp", "Remote", True, "junior", "full-time", ["Python", "FastAPI", "PyTorch"]),
        ("Node.js Backend Developer", "Data Systems", "Remote", True, "entry", "full-time", ["Node.js", "Express", "MongoDB"]),
        ("Senior Java Architect", "Enterprise Inc", "New York, NY", False, "senior", "full-time", ["Java", "Spring", "SQL"]),
        ("Junior Full-Stack Engineer", "Startup Hub", "Remote", True, "junior", "contract", ["React", "Node.js", "MongoDB"]),
        ("Cloud DevOps Specialist", "Cloud Ops", "Remote", True, "mid", "full-time", ["AWS", "Docker", "Kubernetes"]),
        ("Software Engineer Intern", "Big Tech", "Remote", True, "internship", "internship", ["Python", "Git"]),
        ("Data Engineer (ETL)", "Analytics Pro", "Chicago, IL", False, "mid", "full-time", ["Python", "SQL", "Spark"]),
        ("AI Research Assistant", "Lab One", "Remote", True, "entry", "part-time", ["Python", "LLM", "NLP"]),
        ("TypeScript Fullstack Developer", "FinTech Co", "Remote", True, "mid", "full-time", ["TypeScript", "React", "Node.js"]),
        ("SDET / QA Automation Engineer", "Quality First", "Remote", True, "mid", "full-time", ["Python", "Selenium", "pytest"]),
        ("Golang Microservices Developer", "Fast Network", "Remote", True, "senior", "full-time", ["Go", "Docker", "gRPC"]),
        ("Frontend UI Engineer", "Design Tech", "Remote", True, "entry", "full-time", ["React", "Tailwind CSS", "HTML"]),
        ("Backend API Developer (FastAPI)", "API Labs", "Remote", True, "junior", "full-time", ["Python", "FastAPI", "PostgreSQL"]),
        ("Machine Learning Platform Engineer", "Nexus AI", "Remote", True, "senior", "full-time", ["Python", "Kubernetes", "MLOps"]),
        ("Mobile App Developer (React Native)", "Mobile First", "Remote", True, "mid", "contract", ["React", "JavaScript"]),
        ("Junior Web Developer", "Web Studio", "Remote", True, "junior", "full-time", ["JavaScript", "HTML", "CSS"]),
        ("Site Reliability Engineer", "Reliable SRE", "Remote", True, "mid", "full-time", ["Linux", "Python", "Docker"]),
        ("Database Administrator", "Data Core", "Remote", True, "senior", "full-time", ["MongoDB", "MySQL", "PostgreSQL"]),
        ("Junior Software Engineer", "Dev Shop", "Remote", True, "junior", "full-time", ["Python", "Git", "REST"]),
        ("Computer Vision Engineer", "Vision Works", "Remote", True, "mid", "full-time", ["Python", "OpenCV", "C++"]),
        ("NLP Engineer Intern", "Language AI", "Remote", True, "internship", "internship", ["Python", "Transformers"]),
        ("Angular Frontend Developer", "Legacy Tech", "Austin, TX", False, "mid", "full-time", ["Angular", "TypeScript"]),
        ("C++ Embedded Systems Engineer", "Robo Corp", "Remote", True, "senior", "full-time", ["C++", "Linux"]),
        ("Platform Software Engineer", "Infra Inc", "Remote", True, "mid", "full-time", ["Go", "Python", "Docker"]),
    ]

    for idx, (title, comp, loc, rem, sen, emp, skills) in enumerate(tech_specs, 1):
        jobs.append(
            JobPosting(
                source="remotive" if idx % 2 == 0 else "arbeitnow",
                external_id=f"tech-job-{idx}",
                title=title,
                company=comp,
                location=loc,
                remote=rem,
                seniority=sen,
                employment_type=emp,
                skills_required=skills,
                description=f"We are hiring a {title} with skills in {', '.join(skills)}. Great opportunity.",
                url=f"https://jobs.example.com/tech-{idx}",
            )
        )

    # 15 Non-tech jobs
    non_tech_specs = [
        ("Office Assistant", "Legal Group", "Chicago, IL", False, "entry", "full-time"),
        ("Copywriter & Content Writer", "Creative Media", "Remote", True, "mid", "contract"),
        ("Front Desk Receptionist", "Hotel Star", "Miami, FL", False, "entry", "full-time"),
        ("Account Executive - Sales", "Sales Corp", "Remote", True, "mid", "full-time"),
        ("Marketing Coordinator", "Brand Agency", "Remote", True, "junior", "full-time"),
        ("Executive Assistant", "Holdings Ltd", "New York, NY", False, "senior", "full-time"),
        ("Customer Support Representative", "Help Desk", "Remote", True, "entry", "full-time"),
        ("Warehouse Supervisor", "Logistics Inc", "Dallas, TX", False, "mid", "full-time"),
        ("Social Media Specialist", "Viral Media", "Remote", True, "junior", "contract"),
        ("Culinary Chef", "Bistro 44", "San Francisco, CA", False, "senior", "full-time"),
        ("Human Resources Generalist", "People First", "Remote", True, "mid", "full-time"),
        ("Delivery Driver", "Fast Logistics", "Denver, CO", False, "entry", "full-time"),
        ("Senior Accountant", "Tax Experts", "Remote", True, "senior", "full-time"),
        ("Graphic Designer", "Visual Arts", "Remote", True, "mid", "freelance"),
        ("Call Center Agent", "Tele Service", "Remote", True, "entry", "part-time"),
    ]

    for idx, (title, comp, loc, rem, sen, emp) in enumerate(non_tech_specs, 1):
        jobs.append(
            JobPosting(
                source="remotive" if idx % 2 == 0 else "arbeitnow",
                external_id=f"nontech-job-{idx}",
                title=title,
                company=comp,
                location=loc,
                remote=rem,
                seniority=sen,
                employment_type=emp,
                skills_required=[],
                description=f"Looking for a motivated {title} to join our team. No software skills needed.",
                url=f"https://jobs.example.com/nontech-{idx}",
            )
        )

    return jobs


class MockStaticSource(JobSource):
    """Mock source adapter returning fixed fake job set."""

    def __init__(self, name: str, jobs: list[JobPosting]) -> None:
        super().__init__()
        self._name = name
        self._jobs = jobs

    @property
    def name(self) -> str:
        return self._name

    @property
    def display_name(self) -> str:
        return self._name.capitalize()

    @property
    def native_filters(self) -> list[str]:
        return []

    async def search(self, query: JobQuery) -> list[JobPosting]:
        self._last_query_sent = "mock_fetch"
        self._last_http_status = 200
        return list(self._jobs)


@pytest.fixture(autouse=True)
def mock_batch_encode(monkeypatch: pytest.MonkeyPatch):
    from app.services.job_sources.aggregator import _AGGREGATOR_CACHE
    _AGGREGATOR_CACHE.clear()
    fake_vec = [0.05] * 384
    monkeypatch.setattr(
        "app.embeddings.model.batch_encode",
        lambda texts, **kw: [fake_vec for _ in texts],
    )
    monkeypatch.setattr(
        "app.embeddings.model.async_batch_encode",
        lambda texts, **kw: asyncio.sleep(0.001, result=[fake_vec for _ in texts]),
    )
    monkeypatch.setattr(
        "app.services.ranking.agent.batch_encode",
        lambda texts, **kw: [fake_vec for _ in texts],
    )
    monkeypatch.setattr(
        "app.services.ranking.agent.async_batch_encode",
        lambda texts, **kw: asyncio.sleep(0.001, result=[fake_vec for _ in texts]),
    )


@pytest.fixture
def candidate_profile() -> ParsedProfile:
    return ParsedProfile(
        name="Candidate Test",
        title="Full Stack Software Engineer",
        summary="Experience in React, Node.js, Python, FastAPI and modern cloud technologies.",
        location="Remote Worldwide",
        skills=[
            ProfileSkill(name="Python", category="Languages"),
            ProfileSkill(name="JavaScript", category="Languages"),
            ProfileSkill(name="TypeScript", category="Languages"),
            ProfileSkill(name="React", category="Frameworks"),
            ProfileSkill(name="Node.js", category="Frameworks"),
            ProfileSkill(name="FastAPI", category="Frameworks"),
            ProfileSkill(name="MongoDB", category="Databases"),
            ProfileSkill(name="Git", category="Tools"),
        ],
    )


@pytest.mark.asyncio
async def test_empty_preferences_returns_tech_above_non_tech(candidate_profile: ParsedProfile):
    fake_jobs = create_40_fake_jobs()
    mock_src = MockStaticSource("mock", fake_jobs)
    aggregator = JobSourceAggregator(sources={"mock": mock_src})

    query = JobQuery(
        keywords="Software Developer",
        sources=["mock"],
        limit=50,
    )

    search_res = await aggregator.aggregate(query)
    assert search_res.total > 0

    ranking_agent = HybridRankingAgent()
    jobs_with_emb = [JobWithEmbedding(job=j) for j in search_res.jobs]
    rank_res = await ranking_agent.rank_jobs(
        profile=candidate_profile,
        jobs=jobs_with_emb,
        preferences=CandidatePreferences(),
        llm_rerank=False,
    )

    # Tech jobs must score higher than non-tech jobs
    top_5_titles = [item.job.title for item in rank_res.ranked_jobs[:5]]
    for t in top_5_titles:
        assert any(k in t.lower() for k in ["developer", "engineer", "react", "python", "node", "intern"])

    # Non-tech jobs like Office Assistant, Receptionist must score lower
    scores_by_id = {item.job.external_id: item.match.overall_score for item in rank_res.ranked_jobs}
    react_score = scores_by_id.get("tech-job-1", 0)
    assistant_score = scores_by_id.get("nontech-job-1", 0)
    assert react_score > assistant_score


@pytest.mark.asyncio
async def test_strict_fulltime_junior_preference_non_empty(candidate_profile: ParsedProfile):
    fake_jobs = create_40_fake_jobs()
    mock_src = MockStaticSource("mock", fake_jobs)
    aggregator = JobSourceAggregator(sources={"mock": mock_src})

    query = JobQuery(
        keywords="Full Stack Developer",
        employment_types=["full-time"],
        experience_levels=["junior"],
        sources=["mock"],
        limit=50,
    )

    search_res = await aggregator.aggregate(query)
    assert search_res.total >= 10, "Soft preferences must not exclude jobs at discovery stage"

    ranking_agent = HybridRankingAgent()
    jobs_with_emb = [JobWithEmbedding(job=j) for j in search_res.jobs]
    rank_res = await ranking_agent.rank_jobs(
        profile=candidate_profile,
        jobs=jobs_with_emb,
        preferences=CandidatePreferences(
            employment_types=["full-time"],
            experience_levels=["junior"],
        ),
        llm_rerank=False,
    )

    # Must return non-empty ranked jobs
    assert len(rank_res.ranked_jobs) >= 10
    assert rank_res.unfiltered_count >= 10


@pytest.mark.asyncio
async def test_excluded_keywords_removes_matching_only(candidate_profile: ParsedProfile):
    fake_jobs = create_40_fake_jobs()
    mock_src = MockStaticSource("mock", fake_jobs)
    aggregator = JobSourceAggregator(sources={"mock": mock_src})

    query = JobQuery(
        keywords="Software",
        excluded_keywords=["Java", "Assistant"],
        sources=["mock"],
        limit=50,
    )

    search_res = await aggregator.aggregate(query)
    returned_titles = [j.title for j in search_res.jobs]

    # Java and Assistant jobs must be excluded
    for title in returned_titles:
        assert "Java" not in title
        assert "Assistant" not in title

    # Other tech jobs must remain
    assert any("React" in t for t in returned_titles)
    assert any("Python" in t for t in returned_titles)


@pytest.mark.asyncio
async def test_diagnostics_counts_relationship(candidate_profile: ParsedProfile):
    fake_jobs = create_40_fake_jobs()
    # Duplicate some jobs to test dedupe
    dupes = fake_jobs[:5]
    all_jobs = fake_jobs + dupes

    mock_src = MockStaticSource("mock", all_jobs)
    aggregator = JobSourceAggregator(sources={"mock": mock_src})

    query = JobQuery(
        keywords="Software",
        role_families=["software"],
        also_show_other_roles=False,
        sources=["mock"],
        limit=50,
    )

    search_res = await aggregator.aggregate(query)
    diag = search_res.diagnostics
    assert diag is not None

    # Invariant: raw_fetched >= after_dedupe >= after_local_filters
    assert diag.raw_fetched >= diag.after_dedupe
    assert diag.after_dedupe >= diag.after_local_filters
    assert diag.raw_fetched == len(all_jobs)


def test_skipped_chip_reason_when_no_credentials():
    from app.core.config import Settings
    from app.services.job_sources.adzuna import AdzunaSource
    from app.services.job_sources.jsearch import JSearchSource

    empty_settings = Settings(
        ai_service_key="test-key",
        adzuna_app_id="",
        adzuna_app_key="",
        rapidapi_key="",
    )

    adzuna = AdzunaSource(empty_settings)
    assert not adzuna.is_available
    assert adzuna.unavailable_reason == "skipped: no API key"

    jsearch = JSearchSource(empty_settings)
    assert not jsearch.is_available
    assert jsearch.unavailable_reason == "skipped: no API key"


@pytest.mark.asyncio
async def test_greenhouse_and_lever_404_slug_handling():
    from app.core.config import Settings

    settings = Settings(
        ai_service_key="test-key",
        greenhouse_boards="nonexistent-slug-xyz-123456",
        lever_boards="nonexistent-slug-xyz-123456",
    )

    gh = GreenhouseBoardSource(settings)
    query = JobQuery(keywords="developer")
    # Must not raise exception, must return empty list gracefully
    res_gh = await gh.search(query)
    assert res_gh == []

    lever = LeverBoardSource(settings)
    res_lever = await lever.search(query)
    assert res_lever == []
