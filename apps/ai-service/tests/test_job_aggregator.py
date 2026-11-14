from __future__ import annotations

import pytest

from app.core.config import Settings
from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.aggregator import JobSourceAggregator, compute_job_hash
from app.services.job_sources.base import JobSource


class MockSource(JobSource):
    def __init__(
        self,
        name: str,
        postings: list[JobPosting] | None = None,
        should_fail: bool = False,
        available: bool = True,
    ) -> None:
        self._name = name
        self._postings = postings or []
        self._should_fail = should_fail
        self._available = available

    @property
    def name(self) -> str:
        return self._name

    @property
    def is_available(self) -> bool:
        return self._available

    async def search(self, query: JobQuery) -> list[JobPosting]:
        if self._should_fail:
            raise RuntimeError(f"Source {self._name} simulated outage")
        return self._postings


def make_job(
    source: str,
    external_id: str,
    company: str,
    title: str,
    location: str,
    remote: bool = True,
    is_demo: bool = False,
) -> JobPosting:
    return JobPosting(
        source=source,
        external_id=external_id,
        title=title,
        company=company,
        location=location,
        remote=remote,
        description=f"Job at {company}",
        url=f"https://example.com/jobs/{external_id}",
        skills_required=["Python"],
        seniority="senior",
        is_demo=is_demo,
    )


@pytest.mark.asyncio
async def test_aggregator_deduplication_by_source_and_external_id() -> None:
    job1 = make_job("remotive", "id-1", "Acme Corp", "Backend Engineer", "Remote")
    job2 = make_job("remotive", "id-1", "Acme Corp", "Backend Engineer (Duplicate)", "Remote")

    source = MockSource("remotive", postings=[job1, job2])
    aggregator = JobSourceAggregator(sources={"remotive": source})

    result = await aggregator.aggregate(JobQuery(keywords="Backend"))
    assert result.total == 1
    assert result.jobs[0].title == "Backend Engineer"


@pytest.mark.asyncio
async def test_aggregator_deduplication_by_content_hash() -> None:
    # Different sources and different raw strings, but normalizes to same company + title + location
    job_remotive = make_job(
        "remotive",
        "rem-1",
        "TechCorp, Inc.",
        "Senior AI Platform Engineer (Remote)",
        "Remote, USA",
    )
    job_greenhouse = make_job(
        "greenhouse",
        "gh-1",
        "TechCorp LLC",
        "Senior AI Platform Engineer",
        "Remote",
    )

    hash1 = compute_job_hash(job_remotive.company, job_remotive.title, job_remotive.location)
    hash2 = compute_job_hash(job_greenhouse.company, job_greenhouse.title, job_greenhouse.location)
    assert hash1 == hash2

    src1 = MockSource("remotive", postings=[job_remotive])
    src2 = MockSource("greenhouse", postings=[job_greenhouse])
    aggregator = JobSourceAggregator(sources={"remotive": src1, "greenhouse": src2})

    result = await aggregator.aggregate(JobQuery())
    assert result.total == 1
    assert result.sources_responded == 2


@pytest.mark.asyncio
async def test_aggregator_partial_failure_handling() -> None:
    job1 = make_job("remotive", "rem-1", "Alpha Inc", "Software Engineer", "Remote")
    job2 = make_job("lever", "lev-1", "Beta Co", "DevOps Engineer", "Austin, TX")

    src_ok1 = MockSource("remotive", postings=[job1])
    src_failing = MockSource("arbeitnow", should_fail=True)
    src_ok2 = MockSource("lever", postings=[job2])
    src_skipped = MockSource("adzuna", available=False)

    sources = {
        "remotive": src_ok1,
        "arbeitnow": src_failing,
        "lever": src_ok2,
        "adzuna": src_skipped,
    }
    aggregator = JobSourceAggregator(sources=sources)

    result = await aggregator.aggregate(JobQuery())

    assert result.total == 2
    assert result.sources_total == 4
    assert result.sources_responded == 2

    statuses_by_source = {s.source: s for s in result.source_statuses}
    assert statuses_by_source["remotive"].status == "ok"
    assert statuses_by_source["lever"].status == "ok"
    assert statuses_by_source["arbeitnow"].status == "error"
    assert "simulated outage" in str(statuses_by_source["arbeitnow"].error)
    assert statuses_by_source["adzuna"].status == "skipped"


@pytest.mark.asyncio
async def test_demo_source_isolation_when_disabled() -> None:
    demo_job = make_job("demo", "d-1", "FakeCo", "Lead Architect", "Remote", is_demo=True)
    demo_source = MockSource("demo", postings=[demo_job], available=False)
    real_posting = make_job("remotive", "r-1", "RealCo", "Dev", "Remote")
    real_source = MockSource("remotive", postings=[real_posting])

    settings = Settings(ai_service_key="test-key", use_demo_jobs=False)
    aggregator = JobSourceAggregator(
        sources={"remotive": real_source, "demo": demo_source},
        settings=settings,
    )

    # 1. Unfiltered query: demo source must NOT be queried
    result = await aggregator.aggregate(JobQuery())
    assert all(not job.is_demo for job in result.jobs)
    assert not any(s.source == "demo" for s in result.source_statuses)

    # 2. Explicit request for demo source when disabled: must be rejected / skipped
    result2 = await aggregator.aggregate(JobQuery(sources=["demo"]))
    assert len(result2.jobs) == 0
    assert result2.source_statuses[0].status == "skipped"
    assert "USE_DEMO_JOBS=false" in str(result2.source_statuses[0].error)


@pytest.mark.asyncio
async def test_demo_source_included_when_enabled() -> None:
    demo_job = make_job("demo", "d-1", "FakeCo", "Lead Architect", "Remote", is_demo=True)
    demo_source = MockSource("demo", postings=[demo_job], available=True)

    settings = Settings(ai_service_key="test-key", use_demo_jobs=True)
    aggregator = JobSourceAggregator(
        sources={"demo": demo_source},
        settings=settings,
    )

    result = await aggregator.aggregate(JobQuery(sources=["demo"]))
    assert len(result.jobs) == 1
    assert result.jobs[0].is_demo is True
