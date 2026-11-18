from __future__ import annotations

import asyncio
import random
import time
import pytest

from app.schemas.job import JobPosting, JobQuery
from app.schemas.match import CandidatePreferences, JobWithEmbedding
from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience
from app.services.job_sources.aggregator import JobSourceAggregator
from app.services.job_sources.base import JobSource
from app.services.job_sources.role_family import (
    TECH_FAMILIES,
    classify_role_family,
    is_job_english,
    is_location_compatible_for_candidate,
)
from app.services.ranking.agent import HybridRankingAgent
from app.services.ranking.preselector import FastJobPreselector


class MockListSource(JobSource):
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
    """Avoid heavy PyTorch model downloading/weights loading in unit tests."""
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
def junior_profile() -> ParsedProfile:
    return ParsedProfile(
        name="Zohaib Umer",
        summary="Junior Full Stack & AI Developer with skills in React, Node.js, Python, MongoDB, REST.",
        location="Pakistan",
        experience=[
            WorkExperience(
                company="Tech Studio",
                title="Junior Full Stack Developer",
                start="2023-01",
                end="Present",
                bullets=["Built web applications in React, Node.js, and MongoDB."],
                technologies=["React", "Node.js", "MongoDB", "Python"],
            )
        ],
        skills=[
            ProfileSkill(name="React", category="Frameworks"),
            ProfileSkill(name="Node.js", category="Frameworks"),
            ProfileSkill(name="Python", category="Languages"),
            ProfileSkill(name="JavaScript", category="Languages"),
            ProfileSkill(name="MongoDB", category="Databases"),
            ProfileSkill(name="Git", category="Tools"),
            ProfileSkill(name="REST", category="Frameworks"),
        ],
    )


def test_classify_role_family_separates_tech_and_non_tech():
    # Non-tech titles
    assert classify_role_family("Content Creator - YouTube") == "marketing/content/writing"
    assert classify_role_family("Inside Sales Contractor") == "sales"
    assert classify_role_family("US Remote Patient Care Advocate") == "customer_support/service"
    assert classify_role_family("Content Reviewer") == "marketing/content/writing"
    assert classify_role_family("Freelance Copywriter") == "marketing/content/writing"
    assert classify_role_family("Verkaufsberater:in im Aussendienst") == "sales"
    assert classify_role_family("AI Trainer - Video Annotation") == "education_training_annotation"
    assert classify_role_family("Design Assurance Engineer - Medical Devices") in (
        "healthcare",
        "mechanical_electrical_medical_device",
    )

    # Tech titles
    assert classify_role_family("Full-Stack Developer") in TECH_FAMILIES
    assert classify_role_family("Software Engineer, AI Coding Tasks") in TECH_FAMILIES
    assert classify_role_family("Senior Back-end Developer") in TECH_FAMILIES
    assert classify_role_family("Head of Engineering") in TECH_FAMILIES
    assert classify_role_family("QA Automation Engineer") == "qa"
    assert classify_role_family("Cloud DevOps Specialist") == "devops/cloud"


def test_language_and_location_heuristics():
    # German markers
    assert not is_job_english("RACF-Spezialist/ Mainframe Administrator (m/w/d)")
    assert not is_job_english("Verkaufsberater:in im Aussendienst")
    assert is_job_english("Full-Stack Developer", "We are hiring a software engineer.")

    # Location compatibility for Pakistan candidate (not open to relocation)
    compat, note = is_location_compatible_for_candidate("Berlin", False, candidate_country="Pakistan", open_to_relocation=False)
    assert not compat
    assert "onsite_abroad" in (note or "") or "not open to relocation" in (note or "")

    # Remote worldwide is compatible
    compat_rem, _ = is_location_compatible_for_candidate("Remote", True, candidate_country="Pakistan")
    assert compat_rem

    # Remote with country restriction note
    compat_res, res_note = is_location_compatible_for_candidate("USA, Canada", True, candidate_country="Pakistan")
    assert not compat_res
    assert "restricted" in (res_note or "").lower()


@pytest.mark.asyncio
async def test_golden_title_ranking_and_demotion(junior_profile: ParsedProfile):
    """Golden test verifying:
    - Full-Stack Developer ranks #1
    - Software Engineer, AI Coding Tasks in top 5
    - Senior Back-end Developer and Head of Engineering get seniority penalty
    - Non-tech roles are excluded by default or score under 25
    """
    real_sample_jobs = [
        JobPosting(
            source="remotive",
            external_id="job-1",
            title="Full-Stack Developer",
            company="Fluence",
            location="Worldwide",
            remote=True,
            skills_required=["JavaScript", "React", "Node.js", "Git", "REST"],
            description="Looking for a Full-Stack Developer with React, Node.js, Git, and REST.",
            url="https://example.com/1",
        ),
        JobPosting(
            source="remotive",
            external_id="job-2",
            title="Software Engineer, AI Coding Tasks",
            company="Askable",
            location="Worldwide",
            remote=True,
            skills_required=["Python", "JavaScript", "Git"],
            description="Software Engineer for AI Coding tasks using Python and Git.",
            url="https://example.com/2",
        ),
        JobPosting(
            source="remotive",
            external_id="job-3",
            title="Senior Back-end Developer",
            company="Lemon.io",
            location="Worldwide",
            remote=True,
            skills_required=["Python", "PostgreSQL"],
            description="Senior Back-end Developer 6+ years experience.",
            url="https://example.com/3",
        ),
        JobPosting(
            source="remotive",
            external_id="job-4",
            title="Head of Engineering",
            company="Lemon.io",
            location="Worldwide",
            remote=True,
            skills_required=["Leadership", "Strategy"],
            description="Lead engineering teams across the organization.",
            url="https://example.com/4",
        ),
        JobPosting(
            source="remotive",
            external_id="job-5",
            title="Content Creator - YouTube",
            company="Metics Media",
            location="Worldwide",
            remote=True,
            skills_required=["Video", "YouTube"],
            description="Create video content for YouTube channels.",
            url="https://example.com/5",
        ),
        JobPosting(
            source="remotive",
            external_id="job-6",
            title="Inside Sales Contractor",
            company="Credit Wellness",
            location="Worldwide",
            remote=True,
            skills_required=["Sales", "Phone"],
            description="Cold calling leads and booking sales demos.",
            url="https://example.com/6",
        ),
    ]

    mock_src = MockListSource("remotive", real_sample_jobs)
    aggregator = JobSourceAggregator(sources={"remotive": mock_src})

    query = JobQuery(
        keywords="Full Stack Developer",
        sources=["remotive"],
        also_show_other_roles=False,  # default strict tech
    )

    search_res = await aggregator.aggregate(query)
    # Non-tech jobs (Content Creator, Inside Sales) should be removed by the role family gate
    kept_titles = [j.title for j in search_res.jobs]
    assert "Content Creator - YouTube" not in kept_titles
    assert "Inside Sales Contractor" not in kept_titles
    assert "Full-Stack Developer" in kept_titles

    # Now rank the remaining jobs
    ranking_agent = HybridRankingAgent()
    jobs_with_emb = [JobWithEmbedding(job=j) for j in search_res.jobs]
    rank_res = await ranking_agent.rank_jobs(
        profile=junior_profile,
        jobs=jobs_with_emb,
        preferences=CandidatePreferences(
            employment_types=["full-time"],
            experience_levels=["junior", "entry"],
        ),
        llm_rerank=False,
    )

    # Full-Stack Developer must rank first
    assert rank_res.ranked_jobs[0].job.title == "Full-Stack Developer"

    # Senior Back-end Developer and Head of Engineering must have seniority note
    scores_by_title = {r.job.title: r.match for r in rank_res.ranked_jobs}
    senior_match = scores_by_title.get("Senior Back-end Developer")
    head_match = scores_by_title.get("Head of Engineering")

    assert senior_match is not None
    assert "Senior role, above your level" in senior_match.explanation
    assert head_match is not None
    assert "Senior role, above your level" in head_match.explanation


def test_preselection_not_source_order_biased(junior_profile: ParsedProfile):
    """Verify that shuffling input sources does not alter the top preselected jobs."""
    sources = ["greenhouse", "lever", "remotive", "arbeitnow"]
    jobs: list[JobPosting] = []

    for i in range(200):
        src = sources[i % len(sources)]
        # Add high relevance job
        if i % 5 == 0:
            title = "Junior React / Node.js Developer"
            desc = "Working with React, Node.js, and MongoDB."
        else:
            title = "Unrelated Role"
            desc = "Unrelated description."
        jobs.append(
            JobPosting(
                source=src,
                external_id=f"job-{i}",
                title=title,
                company="Company",
                location="Remote",
                description=desc,
                url=f"https://example.com/{i}",
            )
        )

    preselector = FastJobPreselector(target_count=50, max_source_ratio=0.6)

    # Run 1: original order
    res1 = preselector.preselect(jobs, junior_profile, target_titles=["Full Stack Developer"])
    ids1 = [j.external_id for j in res1]

    # Run 2: shuffled order
    shuffled_jobs = list(jobs)
    random.seed(42)
    random.shuffle(shuffled_jobs)
    res2 = preselector.preselect(shuffled_jobs, junior_profile, target_titles=["Full Stack Developer"])
    ids2 = [j.external_id for j in res2]

    # The high match IDs in top 20 should be identical regardless of input order
    set1 = set(ids1[:20])
    set2 = set(ids2[:20])
    assert set1 == set2, "Preselection must be deterministic and immune to source arrival order"


def test_no_generic_fallback_strings_appear_anywhere(junior_profile: ParsedProfile):
    """Unit test that strictly fails if 'General technical profile match'

    or 'matching technical background' appear anywhere in explanation output.
    """
    job = JobPosting(
        source="remotive",
        external_id="j-test",
        title="Software Engineer",
        company="Acme",
        location="Remote",
        description="Software development work.",
        url="https://example.com/test",
    )

    from app.services.ranking.agent import _build_deterministic_explanation

    # Case 1: with skills
    exp1 = _build_deterministic_explanation(job, ["React", "Node.js"], ["AWS"], [], False, None)
    assert "General technical profile match" not in exp1
    assert "matching technical background" not in exp1
    assert "Matches: React, Node.js." in exp1
    assert "Missing: AWS." in exp1

    # Case 2: no skills
    exp2 = _build_deterministic_explanation(job, [], [], ["Senior role, above your level"], False, None)
    assert "General technical profile match" not in exp2
    assert "matching technical background" not in exp2
    assert "No skill overlap found." in exp2
    assert "(Senior role, above your level)" in exp2
