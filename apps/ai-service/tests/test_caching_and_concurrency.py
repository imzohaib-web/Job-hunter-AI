from __future__ import annotations

import os
import sys

# Prevent broken TensorFlow protobuf and pyarrow access violation conflicts on Windows
if "tensorflow" not in sys.modules:
    sys.modules["tensorflow"] = None
if "pyarrow" not in sys.modules:
    sys.modules["pyarrow"] = None

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import asyncio
import copy
import pytest

import app.embeddings.model as emb_model
_FAKE_VEC = [0.05] * 384
emb_model.batch_encode = lambda texts, *args, **kwargs: [_FAKE_VEC for _ in texts]
async def _fake_async_enc(texts, *args, **kwargs):
    return [_FAKE_VEC for _ in texts]
emb_model.async_batch_encode = _fake_async_enc
emb_model.is_model_ready = lambda: True

from app.core.config import get_settings
from app.schemas.job import JobPosting, JobQuery
from app.schemas.match import CandidatePreferences
from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience
import app.services.discovery_pipeline as dp
from app.services.discovery_pipeline import run_discovery
from app.services.job_sources.aggregator import (
    _AGGREGATOR_CACHE,
    JobSourceAggregator,
)
from app.services.job_sources.base import JobSource


class MockDeterministicSource(JobSource):
    def __init__(self, name: str, postings: list[JobPosting]) -> None:
        super().__init__()
        self._name = name
        self._postings = postings
        self.call_count = 0

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
        self.call_count += 1
        self._last_query_sent = query.keywords
        self._last_http_status = 200
        return [copy.deepcopy(j) for j in self._postings]


@pytest.fixture
def sample_test_profile() -> ParsedProfile:
    return ParsedProfile(
        name="Candidate A",
        title="Full Stack Software Engineer",
        summary="Skilled in React, Node.js, Python, MongoDB, and REST APIs.",
        location="Pakistan",
        experience=[
            WorkExperience(
                company="Tech Studio",
                title="Junior Full Stack Developer",
                start="2023-01",
                end="Present",
                technologies=["React", "Node.js", "Python"],
            )
        ],
        skills=[
            ProfileSkill(name="React", category="Frameworks"),
            ProfileSkill(name="Node.js", category="Frameworks"),
            ProfileSkill(name="Python", category="Languages"),
            ProfileSkill(name="MongoDB", category="Databases"),
            ProfileSkill(name="REST", category="Frameworks"),
        ],
    )


@pytest.fixture
def mock_jobs() -> list[JobPosting]:
    return [
        JobPosting(
            source="remotive",
            external_id="101",
            title="Junior Full Stack Developer",
            company="GitLab",
            location="Remote (worldwide)",
            remote=True,
            skills_required=["React", "Node.js", "Python"],
            description="Join as a Junior Full Stack Developer working with React, Node.js, and Python.",
            url="https://remotive.com/101",
        ),
        JobPosting(
            source="remotive",
            external_id="102",
            title="Junior Full Stack Developer, Europe",
            company="GitLab",
            location="Remote - Europe",
            remote=True,
            skills_required=["React", "Node.js"],
            description="Join as a Junior Full Stack Developer working with React and Node.js.",
            url="https://remotive.com/102",
        ),
        JobPosting(
            source="remotive",
            external_id="103",
            title="React Frontend Developer",
            company="Acme Corp",
            location="Remote",
            remote=True,
            skills_required=["React", "JavaScript", "HTML"],
            description="Frontend developer building React web apps.",
            url="https://remotive.com/103",
        ),
        JobPosting(
            source="arbeitnow",
            external_id="201",
            title="Python Backend Engineer",
            company="DataCorp",
            location="Remote",
            remote=True,
            skills_required=["Python", "REST", "MongoDB"],
            description="Python developer building REST APIs and MongoDB backend.",
            url="https://arbeitnow.com/201",
        ),
    ]


def test_warm_cache_sequential_runs_immutability(
    sample_test_profile: ParsedProfile,
    mock_jobs: list[JobPosting],
    monkeypatch: pytest.MonkeyPatch,
):
    async def _run():
        print("CP 1: clear cache", flush=True)
        _AGGREGATOR_CACHE.clear()

        src_remotive = MockDeterministicSource("remotive", mock_jobs[:3])
        src_arbeitnow = MockDeterministicSource("arbeitnow", mock_jobs[3:])

        sources = {
            "remotive": src_remotive,
            "arbeitnow": src_arbeitnow,
        }

        print("CP 2: patch aggregator", flush=True)
        monkeypatch.setattr(
            dp,
            "JobSourceAggregator",
            lambda settings=None: JobSourceAggregator(sources=sources, settings=settings),
        )

        query = JobQuery(keywords="Full Stack Developer", sources=["remotive", "arbeitnow"])
        prefs = CandidatePreferences(target_titles=["Full Stack Developer"], remote_worldwide=True)

        print("CP 3: run_discovery 1", flush=True)
        res1 = await run_discovery(
            profile=sample_test_profile,
            preferences=prefs,
            query=query,
            sources=["remotive", "arbeitnow"],
            llm_rerank=False,
        )
        print("CP 4: run_discovery 1 returned", flush=True)

        assert len(res1["ranked_jobs"]) > 0
        assert src_remotive.call_count == 1
        assert src_arbeitnow.call_count == 1

        scores1 = [j.match.overall_score for j in res1["ranked_jobs"]]
        titles1 = [j.job.title for j in res1["ranked_jobs"]]
        tiers1 = [j.match.tier for j in res1["ranked_jobs"]]

        # Check near-duplicate locations on run 1
        gitlab1 = next((j.job for j in res1["ranked_jobs"] if j.job.company == "GitLab"), None)
        dup_len_1 = len(gitlab1.duplicate_locations) if (gitlab1 and gitlab1.duplicate_locations) else 0

        # RUN 2: Warm Cache
        res2 = await run_discovery(
            profile=sample_test_profile,
            preferences=prefs,
            query=query,
            sources=["remotive", "arbeitnow"],
            llm_rerank=False,
        )

        # Sources should not have been queried again due to cache hit
        assert src_remotive.call_count == 1
        assert src_arbeitnow.call_count == 1

        scores2 = [j.match.overall_score for j in res2["ranked_jobs"]]
        titles2 = [j.job.title for j in res2["ranked_jobs"]]
        tiers2 = [j.match.tier for j in res2["ranked_jobs"]]

        assert scores1 == scores2, "Scores must be identical between cold and warm runs"
        assert titles1 == titles2, "Ranked titles must be identical between cold and warm runs"
        assert tiers1 == tiers2, "Tiers must be identical between cold and warm runs"

        # Invariant: duplicate_locations must NOT double or grow on cache hits
        gitlab2 = next((j.job for j in res2["ranked_jobs"] if j.job.company == "GitLab"), None)
        dup_len_2 = len(gitlab2.duplicate_locations) if (gitlab2 and gitlab2.duplicate_locations) else 0
        assert dup_len_1 == dup_len_2, f"duplicate_locations must remain constant, got {dup_len_1} vs {dup_len_2}"

        # RUN 3: Third run to ensure idempotency across multiple warm hits
        res3 = await run_discovery(
            profile=sample_test_profile,
            preferences=prefs,
            query=query,
            sources=["remotive", "arbeitnow"],
            llm_rerank=False,
        )

        scores3 = [j.match.overall_score for j in res3["ranked_jobs"]]
        assert scores1 == scores3

    asyncio.run(_run())


def test_concurrent_discovery_runs(
    sample_test_profile: ParsedProfile,
    mock_jobs: list[JobPosting],
    monkeypatch: pytest.MonkeyPatch,
):
    async def _run():
        _AGGREGATOR_CACHE.clear()

        src_remotive = MockDeterministicSource("remotive", mock_jobs[:3])
        src_arbeitnow = MockDeterministicSource("arbeitnow", mock_jobs[3:])

        sources = {
            "remotive": src_remotive,
            "arbeitnow": src_arbeitnow,
        }

        monkeypatch.setattr(
            dp,
            "JobSourceAggregator",
            lambda settings=None: JobSourceAggregator(sources=sources, settings=settings),
        )

        query = JobQuery(keywords="Full Stack Developer", sources=["remotive", "arbeitnow"])
        prefs = CandidatePreferences(target_titles=["Full Stack Developer"], remote_worldwide=True)

        # Execute 3 concurrent discovery calls
        t1 = run_discovery(profile=sample_test_profile, preferences=prefs, query=query, sources=["remotive", "arbeitnow"], llm_rerank=False)
        t2 = run_discovery(profile=sample_test_profile, preferences=prefs, query=query, sources=["remotive", "arbeitnow"], llm_rerank=False)
        t3 = run_discovery(profile=sample_test_profile, preferences=prefs, query=query, sources=["remotive", "arbeitnow"], llm_rerank=False)

        results = await asyncio.gather(t1, t2, t3)
        assert len(results) == 3
        for r in results:
            assert len(r["ranked_jobs"]) > 0
            assert r["total"] > 0

    asyncio.run(_run())


def test_changing_preferences_yields_different_results(
    sample_test_profile: ParsedProfile,
    mock_jobs: list[JobPosting],
    monkeypatch: pytest.MonkeyPatch,
):
    async def _run():
        _AGGREGATOR_CACHE.clear()

        src_remotive = MockDeterministicSource("remotive", mock_jobs[:3])
        src_arbeitnow = MockDeterministicSource("arbeitnow", mock_jobs[3:])

        sources = {
            "remotive": src_remotive,
            "arbeitnow": src_arbeitnow,
        }

        monkeypatch.setattr(
            dp,
            "JobSourceAggregator",
            lambda settings=None: JobSourceAggregator(sources=sources, settings=settings),
        )

        query1 = JobQuery(keywords="Full Stack Developer", sources=["remotive", "arbeitnow"])
        prefs1 = CandidatePreferences(target_titles=["Full Stack Developer"], excluded_companies=[])

        res1 = await run_discovery(
            profile=sample_test_profile,
            preferences=prefs1,
            query=query1,
            sources=["remotive", "arbeitnow"],
            llm_rerank=False,
        )

        query2 = JobQuery(keywords="Full Stack Developer", sources=["remotive", "arbeitnow"], excluded_companies=["GitLab"])
        prefs2 = CandidatePreferences(target_titles=["Full Stack Developer"], excluded_companies=["GitLab"])

        res2 = await run_discovery(
            profile=sample_test_profile,
            preferences=prefs2,
            query=query2,
            sources=["remotive", "arbeitnow"],
            llm_rerank=False,
        )

        companies1 = {j.job.company for j in res1["ranked_jobs"]}
        companies2 = {j.job.company for j in res2["ranked_jobs"]}

        assert "GitLab" in companies1
        assert "GitLab" not in companies2

    asyncio.run(_run())
