from __future__ import annotations

import json
from pathlib import Path

import pytest
import respx
from httpx import Response

from app.core.config import Settings
from app.schemas.job import JobQuery
from app.services.job_sources.adzuna import AdzunaSource
from app.services.job_sources.arbeitnow import ArbeitnowSource
from app.services.job_sources.demo import DemoSource
from app.services.job_sources.greenhouse import GreenhouseBoardSource
from app.services.job_sources.himalayas import HimalayasSource
from app.services.job_sources.jobicy import JobicySource
from app.services.job_sources.jsearch import JSearchSource
from app.services.job_sources.lever import LeverBoardSource
from app.services.job_sources.remoteok import RemoteOKSource
from app.services.job_sources.remotive import RemotiveSource
from app.services.job_sources.weworkremotely import WeWorkRemotelySource

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "job_sources"


def load_fixture(filename: str) -> dict | list:
    with open(FIXTURES_DIR / filename, encoding="utf-8") as f:
        return json.load(f)


@pytest.mark.asyncio
@respx.mock
async def test_remotive_source() -> None:
    fixture_data = load_fixture("remotive.json")
    respx.get("https://remotive.com/api/remote-jobs").mock(
        return_value=Response(200, json=fixture_data)
    )

    source = RemotiveSource()
    query = JobQuery(keywords="python", limit=10)
    jobs = await source.search(query)

    assert len(jobs) == 2
    job1 = jobs[0]
    assert job1.source == "remotive"
    assert job1.external_id == "101"
    assert job1.title == "Senior Python Engineer"
    assert job1.company == "CloudNova Systems"
    assert job1.remote is True
    assert job1.salary_min == 140000.0
    assert job1.salary_max == 180000.0
    assert job1.currency == "USD"
    assert "FastAPI" in job1.skills_required
    assert job1.seniority == "senior"
    assert job1.is_demo is False


@pytest.mark.asyncio
@respx.mock
async def test_arbeitnow_source() -> None:
    fixture_data = load_fixture("arbeitnow.json")
    respx.get("https://www.arbeitnow.com/api/job-board-api").mock(
        return_value=Response(200, json=fixture_data)
    )

    source = ArbeitnowSource()
    query = JobQuery(keywords="", limit=10)
    jobs = await source.search(query)

    assert len(jobs) == 2
    job1 = jobs[0]
    assert job1.source == "arbeitnow"
    assert job1.external_id == "arbeit-python-backend-lead-201"
    assert job1.company == "Berlin AI Labs GmbH"
    assert job1.remote is True
    assert "PostgreSQL" in job1.skills_required
    assert job1.posted_at is not None
    assert job1.is_demo is False


@pytest.mark.asyncio
@respx.mock
async def test_adzuna_source_with_keys() -> None:
    fixture_data = load_fixture("adzuna.json")
    respx.get(url__regex=r"^https://api\.adzuna\.com/.*").mock(
        return_value=Response(200, json=fixture_data)
    )

    settings = Settings(
        ai_service_key="test-key",
        adzuna_app_id="dummy-app-id",
        adzuna_app_key="dummy-app-key",
        adzuna_country="us",
    )
    source = AdzunaSource(settings=settings)
    assert source.is_available is True

    query = JobQuery(keywords="engineer", limit=5)
    jobs = await source.search(query)

    assert len(jobs) == 2
    assert jobs[0].source == "adzuna"
    assert jobs[0].external_id == "adzuna-301"
    assert jobs[0].salary_min == 160000.0
    assert jobs[0].salary_max == 210000.0
    assert jobs[0].currency == "USD"
    assert jobs[0].is_demo is False


@pytest.mark.asyncio
async def test_adzuna_source_skips_when_keys_missing() -> None:
    settings = Settings(
        ai_service_key="test-key",
        adzuna_app_id="",
        adzuna_app_key="",
    )
    source = AdzunaSource(settings=settings)
    assert source.is_available is False

    query = JobQuery(keywords="python")
    jobs = await source.search(query)
    assert jobs == []


@pytest.mark.asyncio
@respx.mock
async def test_greenhouse_source() -> None:
    fixture_data = load_fixture("greenhouse.json")
    respx.get("https://boards-api.greenhouse.io/v1/boards/airbnb/jobs").mock(
        return_value=Response(200, json=fixture_data)
    )

    settings = Settings(
        ai_service_key="test-key",
        greenhouse_boards="airbnb",
    )
    source = GreenhouseBoardSource(settings=settings)

    query = JobQuery(keywords="", limit=5)
    jobs = await source.search(query)

    assert len(jobs) == 2
    job1 = jobs[0]
    assert job1.source == "greenhouse"
    assert job1.external_id == "airbnb-401"
    assert job1.company == "Airbnb"
    assert "Kubernetes" in job1.skills_required
    assert job1.is_demo is False


@pytest.mark.asyncio
@respx.mock
async def test_greenhouse_source_404_resilient() -> None:
    respx.get("https://boards-api.greenhouse.io/v1/boards/nonexistent/jobs").mock(
        return_value=Response(404, json={"error": "Not Found"})
    )

    settings = Settings(ai_service_key="test-key")
    source = GreenhouseBoardSource(settings=settings)

    query = JobQuery(company_slugs=["nonexistent"])
    jobs = await source.search(query)
    assert jobs == []


@pytest.mark.asyncio
@respx.mock
async def test_lever_source() -> None:
    fixture_data = load_fixture("lever.json")
    respx.get("https://api.lever.co/v0/postings/netflix").mock(
        return_value=Response(200, json=fixture_data)
    )

    settings = Settings(
        ai_service_key="test-key",
        lever_boards="netflix",
    )
    source = LeverBoardSource(settings=settings)

    query = JobQuery(keywords="", limit=5)
    jobs = await source.search(query)

    assert len(jobs) == 2
    job1 = jobs[0]
    assert job1.source == "lever"
    assert job1.external_id == "netflix-lever-501"
    assert job1.company == "Netflix"
    assert job1.remote is True
    assert "PyTorch" in job1.skills_required
    assert job1.is_demo is False


@pytest.mark.asyncio
@respx.mock
async def test_jsearch_source_with_key() -> None:
    fixture_data = load_fixture("jsearch.json")
    respx.get("https://jsearch.p.rapidapi.com/search").mock(
        return_value=Response(200, json=fixture_data)
    )

    settings = Settings(
        ai_service_key="test-key",
        rapidapi_key="test-rapidapi-key",
    )
    source = JSearchSource(settings=settings)
    assert source.is_available is True

    query = JobQuery(keywords="ai engineer", limit=5)
    jobs = await source.search(query)

    assert len(jobs) == 2
    assert jobs[0].source == "jsearch"
    assert jobs[0].external_id == "jsearch-601"
    assert jobs[0].company == "Synthetix AI Corp"
    assert jobs[0].is_demo is False


@pytest.mark.asyncio
async def test_jsearch_source_skips_when_key_missing() -> None:
    settings = Settings(
        ai_service_key="test-key",
        rapidapi_key="",
    )
    source = JSearchSource(settings=settings)
    assert source.is_available is False

    query = JobQuery(keywords="developer")
    jobs = await source.search(query)
    assert jobs == []


@pytest.mark.asyncio
async def test_demo_source_off_by_default() -> None:
    settings = Settings(ai_service_key="test-key", use_demo_jobs=False)
    source = DemoSource(settings=settings)
    assert source.is_available is False

    jobs = await source.search(JobQuery(keywords="Python"))
    assert jobs == []


@pytest.mark.asyncio
async def test_demo_source_enabled_marks_all_demo() -> None:
    settings = Settings(ai_service_key="test-key", use_demo_jobs=True)
    source = DemoSource(settings=settings)
    assert source.is_available is True

    jobs = await source.search(JobQuery(keywords="Python Engineer", limit=5))
    assert len(jobs) > 0
    assert all(job.is_demo is True for job in jobs)
    assert all(job.source == "demo" for job in jobs)


@pytest.mark.asyncio
@respx.mock
async def test_retry_on_transient_failure() -> None:
    fixture_data = load_fixture("remotive.json")
    route = respx.get("https://remotive.com/api/remote-jobs")
    route.side_effect = [
        Response(500, json={"error": "temporary outage"}),
        Response(200, json=fixture_data),
    ]

    source = RemotiveSource()
    jobs = await source.search(JobQuery(keywords="python"))
    assert len(jobs) == 2


@pytest.mark.asyncio
@respx.mock
async def test_greenhouse_keyword_filtering_relevance() -> None:
    # Fixture with relevant tech role and non-tech role
    fake_board = {
        "jobs": [
            {
                "id": 101,
                "title": "Software Engineer Intern",
                "content": "Work on backend distributed systems with Python and React.",
                "location": {"name": "Remote"},
                "updated_at": "2026-11-01T12:00:00Z",
                "absolute_url": "https://example.com/job/101",
            },
            {
                "id": 102,
                "title": "Account Executive",
                "content": "Responsible for B2B enterprise software sales quotas.",
                "location": {"name": "New York, NY"},
                "updated_at": "2026-11-01T12:00:00Z",
                "absolute_url": "https://example.com/job/102",
            },
        ]
    }
    respx.get("https://boards-api.greenhouse.io/v1/boards/airbnb/jobs").mock(
        return_value=Response(200, json=fake_board)
    )

    settings = Settings(ai_service_key="test-key", greenhouse_boards="airbnb")
    source = GreenhouseBoardSource(settings=settings)

    # Search for software engineer intern
    jobs = await source.search(JobQuery(keywords="software engineer intern"))
    assert len(jobs) == 1
    assert jobs[0].external_id == "airbnb-101"
    assert jobs[0].title == "Software Engineer Intern"


@pytest.mark.asyncio
@respx.mock
async def test_lever_keyword_filtering_relevance() -> None:
    fake_board = [
        {
            "id": "lev-101",
            "text": "Full Stack Developer",
            "categories": {"location": "Remote"},
            "workplaceType": "remote",
            "description": "Building full-stack web applications with TypeScript and Node.",
            "lists": [],
            "createdAt": 1730000000000,
            "hostedUrl": "https://example.com/job/lev-101",
        },
        {
            "id": "lev-102",
            "text": "Senior Account Executive",
            "categories": {"location": "London"},
            "workplaceType": "onsite",
            "description": "Sales management for music software enterprise accounts.",
            "lists": [],
            "createdAt": 1730000000000,
            "hostedUrl": "https://example.com/job/lev-102",
        },
    ]
    respx.get("https://api.lever.co/v0/postings/spotify").mock(
        return_value=Response(200, json=fake_board)
    )

    settings = Settings(ai_service_key="test-key", lever_boards="spotify")
    source = LeverBoardSource(settings=settings)

    jobs = await source.search(JobQuery(keywords="full stack developer"))
    assert len(jobs) == 1
    assert jobs[0].external_id == "spotify-lev-101"
    assert jobs[0].title == "Full Stack Developer"


@pytest.mark.asyncio
@respx.mock
async def test_remoteok_source() -> None:
    fake_data = [
        {"legal": "Notice"},
        {
            "id": 991,
            "position": "Senior React Developer",
            "company": "RemoteTech",
            "location": "Worldwide",
            "description": "Building UI with React and TypeScript.",
            "tags": ["react", "typescript"],
            "url": "https://remoteok.com/l/991",
            "date": "2026-11-15T12:00:00Z",
        },
    ]
    respx.get("https://remoteok.com/api").mock(return_value=Response(200, json=fake_data))
    source = RemoteOKSource()
    jobs = await source.search(JobQuery(keywords="react"))
    assert len(jobs) == 1
    assert jobs[0].source == "remoteok"
    assert jobs[0].title == "Senior React Developer"
    assert jobs[0].remote is True


@pytest.mark.asyncio
@respx.mock
async def test_jobicy_source() -> None:
    fake_data = {
        "jobs": [
            {
                "id": "jobicy-1",
                "jobTitle": "Full Stack Engineer",
                "companyName": "Jobicy Corp",
                "jobGeo": "Worldwide",
                "jobDescription": "We need a Full Stack Engineer with Node.js and MongoDB.",
                "url": "https://jobicy.com/jobs/1",
                "annualSalaryMin": 70000,
                "annualSalaryMax": 100000,
                "salaryCurrency": "USD",
                "pubDate": "2026-11-15T10:00:00Z",
            }
        ]
    }
    respx.get("https://jobicy.com/api/v2/remote-jobs").mock(return_value=Response(200, json=fake_data))
    source = JobicySource()
    jobs = await source.search(JobQuery(keywords="engineer"))
    assert len(jobs) == 1
    assert jobs[0].source == "jobicy"
    assert jobs[0].title == "Full Stack Engineer"
    assert jobs[0].salary_min == 70000.0


@pytest.mark.asyncio
@respx.mock
async def test_himalayas_source() -> None:
    fake_data = {
        "jobs": [
            {
                "id": "him-101",
                "title": "Backend Python Developer",
                "companyName": "Himalayas Tech",
                "locationRestrictions": ["Worldwide"],
                "description": "FastAPI and PostgreSQL development.",
                "applicationLink": "https://himalayas.app/jobs/him-101",
                "pubDate": "2026-11-15T14:00:00Z",
            }
        ]
    }
    respx.get("https://himalayas.app/jobs/api").mock(return_value=Response(200, json=fake_data))
    source = HimalayasSource()
    jobs = await source.search(JobQuery(keywords="python"))
    assert len(jobs) == 1
    assert jobs[0].source == "himalayas"
    assert jobs[0].title == "Backend Python Developer"


@pytest.mark.asyncio
@respx.mock
async def test_weworkremotely_source() -> None:
    rss_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>We Work Remotely</title>
        <item>
          <title>Basecamp: Senior Ruby Programmer</title>
          <link>https://weworkremotely.com/jobs/101</link>
          <description>Build web apps in Ruby and Rails.</description>
          <pubDate>Sun, 15 Nov 2026 12:00:00 +0000</pubDate>
          <guid>https://weworkremotely.com/jobs/101</guid>
        </item>
      </channel>
    </rss>
    """
    respx.get("https://weworkremotely.com/categories/remote-programming-jobs.rss").mock(
        return_value=Response(200, content=rss_xml.encode("utf-8"))
    )
    respx.get("https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss").mock(
        return_value=Response(200, content=b"<rss><channel></channel></rss>")
    )
    source = WeWorkRemotelySource()
    jobs = await source.search(JobQuery(keywords="developer"))
    assert len(jobs) == 1
    assert jobs[0].source == "weworkremotely"
    assert jobs[0].company == "Basecamp"
    assert jobs[0].title == "Senior Ruby Programmer"

