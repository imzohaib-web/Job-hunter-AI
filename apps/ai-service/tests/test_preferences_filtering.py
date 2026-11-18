from __future__ import annotations

import datetime

from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.aggregator import JobSourceAggregator, apply_local_filters
from app.services.job_sources.base import JobSource


class FakeSource(JobSource):
    def __init__(
        self,
        name: str,
        postings: list[JobPosting] | None = None,
        native_filters: list[str] | None = None,
        available: bool = True,
        reason: str | None = None,
    ) -> None:
        self._name = name
        self._postings = postings or []
        self._native_filters = native_filters or ["keywords"]
        self._available = available
        self._reason = reason

    @property
    def name(self) -> str:
        return self._name

    @property
    def display_name(self) -> str:
        return self._name.capitalize()

    @property
    def native_filters(self) -> list[str]:
        return self._native_filters

    @property
    def is_available(self) -> bool:
        return self._available

    @property
    def unavailable_reason(self) -> str | None:
        return self._reason

    async def search(self, query: JobQuery) -> list[JobPosting]:
        return self._postings


def make_test_job(
    source: str = "arbeitnow",
    external_id: str = "job-1",
    company: str = "Acme Inc",
    title: str = "Senior Full-Stack Engineer",
    location: str = "Berlin, Germany",
    remote: bool = False,
    salary_min: float | None = 90000.0,
    salary_max: float | None = 130000.0,
    employment_type: str | None = "full-time",
    seniority: str = "senior",
    skills: list[str] | None = None,
    posted_at: str | None = None,
    description: str = "Developing full stack web apps with Python and React.",
) -> JobPosting:
    return JobPosting(
        source=source,
        external_id=external_id,
        title=title,
        company=company,
        location=location,
        remote=remote,
        salary_min=salary_min,
        salary_max=salary_max,
        currency="USD",
        description=description,
        url=f"https://example.com/jobs/{external_id}",
        skills_required=skills or ["Python", "React"],
        seniority=seniority,
        employment_type=employment_type,
        posted_at=posted_at or datetime.datetime.now(datetime.UTC).isoformat(),
        is_demo=False,
    )


def test_local_filtering_by_salary():
    job1 = make_test_job(external_id="1", salary_min=60000, salary_max=80000)
    job2 = make_test_job(external_id="2", salary_min=120000, salary_max=160000)
    job3 = make_test_job(external_id="3", salary_min=None, salary_max=None)

    source = FakeSource("arbeitnow", native_filters=["keywords"])

    # Query with salary_min = 100,000 yearly
    query = JobQuery(salary_min=100000.0, salary_period="yearly")
    filtered, applied = apply_local_filters([job1, job2, job3], query, source)
    assert "salary" in applied
    # job1 max is 80k (<100k) so dropped, job2 is 160k (kept), job3 has no salary
    assert len(filtered) == 2
    assert {j.external_id for j in filtered} == {"2", "3"}

    # Query with hide_without_salary = True
    query_hide = JobQuery(salary_min=100000.0, salary_period="yearly", hide_without_salary=True)
    filtered_hide, _ = apply_local_filters([job1, job2, job3], query_hide, source)
    assert len(filtered_hide) == 1
    assert filtered_hide[0].external_id == "2"


def test_local_filtering_by_employment_type():
    job_ft = make_test_job(
        external_id="ft", title="Full-Time Engineer", employment_type="full-time"
    )
    job_contract = make_test_job(
        external_id="c",
        title="Frontend Contractor",
        employment_type="contract",
        description="6-month contract role.",
    )
    job_intern = make_test_job(
        external_id="i",
        title="Software Intern",
        employment_type="internship",
        description="Summer internship position.",
    )

    source = FakeSource("arbeitnow", native_filters=["keywords"])

    query = JobQuery(employment_types=["contract", "internship"])
    filtered, applied = apply_local_filters([job_ft, job_contract, job_intern], query, source)
    assert "employment_type" in applied
    assert len(filtered) == 2
    assert {j.external_id for j in filtered} == {"c", "i"}


def test_local_filtering_by_date_posted():
    now = datetime.datetime.now(datetime.UTC)
    fresh_date = (now - datetime.timedelta(hours=6)).isoformat()
    old_date = (now - datetime.timedelta(days=15)).isoformat()

    job_fresh = make_test_job(external_id="fresh", posted_at=fresh_date)
    job_old = make_test_job(external_id="old", posted_at=old_date)

    source = FakeSource("arbeitnow", native_filters=["keywords"])

    query_3d = JobQuery(date_posted="3d")
    filtered, applied = apply_local_filters([job_fresh, job_old], query_3d, source)
    assert "date_posted" in applied
    assert len(filtered) == 1
    assert filtered[0].external_id == "fresh"


def test_local_filtering_by_skills_and_exclusions():
    job1 = make_test_job(
        external_id="1",
        title="AI Engineer",
        company="SpamCo",
        skills=["Python", "FastAPI", "PyTorch"],
        description="Build machine learning models with PyTorch.",
    )
    job2 = make_test_job(
        external_id="2",
        title="Web Developer",
        company="GoodCorp",
        skills=["React", "TypeScript"],
        description="Build React interfaces with legacy WordPress.",
    )
    job3 = make_test_job(
        external_id="3",
        title="Python Backend Engineer",
        company="GoodCorp",
        skills=["Python", "PostgreSQL"],
        description="Core platform backend development.",
    )

    source = FakeSource("greenhouse", native_filters=["keywords"])

    query = JobQuery(
        must_have_skills=["Python"],
        excluded_companies=["SpamCo"],
        excluded_keywords=["wordpress"],
    )
    filtered, applied = apply_local_filters([job1, job2, job3], query, source)
    assert "must_have_skills" in applied
    assert "excluded_companies" in applied
    assert "excluded_keywords" in applied

    # job1 excluded by company SpamCo
    # job2 excluded by missing Python & excluded keyword wordpress
    # job3 kept!
    assert len(filtered) == 1
    assert filtered[0].external_id == "3"


def test_aggregator_reports_local_filters_applied_per_source():
    job_adzuna = make_test_job(
        source="adzuna", external_id="adz-1", salary_min=130000, salary_max=150000
    )
    job_arbeitnow = make_test_job(
        source="arbeitnow", external_id="arb-1", salary_min=130000, salary_max=150000
    )

    # Adzuna natively supports salary and employment types; Arbeitnow does not
    source_adzuna = FakeSource(
        "adzuna",
        postings=[job_adzuna],
        native_filters=[
            "keywords",
            "target_titles",
            "location",
            "salary",
            "employment_types",
            "date_posted",
        ],
    )
    source_arbeitnow = FakeSource(
        "arbeitnow", postings=[job_arbeitnow], native_filters=["keywords"]
    )

    query = JobQuery(
        target_titles=["Engineer"],
        salary_min=100000.0,
        salary_period="yearly",
        employment_types=["full-time"],
    )

    # Test Adzuna: native filters must NOT be flagged as applied locally
    filtered_adzuna, applied_adzuna = apply_local_filters([job_adzuna], query, source_adzuna)
    assert len(filtered_adzuna) == 1
    assert "salary" not in applied_adzuna
    assert "employment_type" not in applied_adzuna

    # Test Arbeitnow: non-native filters MUST be flagged as applied locally
    filtered_arbeitnow, applied_arbeitnow = apply_local_filters(
        [job_arbeitnow], query, source_arbeitnow
    )
    assert len(filtered_arbeitnow) == 1
    assert "salary" in applied_arbeitnow
    assert "employment_type" in applied_arbeitnow

    # Test aggregator source metadata inspection
    aggregator = JobSourceAggregator(
        sources={"adzuna": source_adzuna, "arbeitnow": source_arbeitnow}
    )
    source_statuses = aggregator.get_source_statuses()
    status_map = {s["source"]: s for s in source_statuses}
    assert status_map["adzuna"]["available"] is True
    assert "salary" in status_map["adzuna"]["supportedFilters"]
    assert status_map["arbeitnow"]["available"] is True
    assert "keywords" in status_map["arbeitnow"]["supportedFilters"]
