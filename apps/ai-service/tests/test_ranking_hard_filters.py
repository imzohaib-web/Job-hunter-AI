from __future__ import annotations

from app.schemas.job import JobPosting
from app.schemas.match import CandidatePreferences
from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience
from app.services.ranking.hard_filters import evaluate_hard_filters


def make_test_profile(
    years: float = 3.0,
    location: str = "San Francisco, CA",
) -> ParsedProfile:
    return ParsedProfile(
        name="Alex Smith",
        summary="Software Engineer specializing in Python and backend services.",
        location=location,
        skills=[ProfileSkill(name="Python", category="Languages", years=years)],
        experience=[
            WorkExperience(
                company="Tech Corp",
                title="Software Engineer",
                start="2021-01",
                end="2024-01",
                bullets=["Built backend services"],
                technologies=["Python", "FastAPI"],
            )
        ],
    )


def make_test_job(
    title: str = "Backend Engineer",
    company: str = "Acme Inc",
    location: str = "San Francisco, CA",
    remote: bool = False,
    description: str = "We need an engineer with 3+ years of experience.",
    seniority: str = "mid",
) -> JobPosting:
    return JobPosting(
        source="manual",
        external_id="job-1",
        title=title,
        company=company,
        location=location,
        remote=remote,
        description=description,
        url="https://example.com/job/1",
        skills_required=["Python"],
        seniority=seniority,
    )


def test_hard_filter_excluded_company() -> None:
    profile = make_test_profile()
    job = make_test_job(company="BadCorp Technologies, Inc.")
    prefs = CandidatePreferences(excluded_companies=["BadCorp"])

    failed, reason = evaluate_hard_filters(job, profile, prefs)
    assert failed is True
    assert reason is not None
    assert "excluded list" in reason


def test_hard_filter_excluded_keyword() -> None:
    profile = make_test_profile()
    job = make_test_job(title="Crypto / Web3 Blockchain Engineer")
    prefs = CandidatePreferences(excluded_keywords=["crypto", "blockchain"])

    failed, reason = evaluate_hard_filters(job, profile, prefs)
    assert failed is True
    assert reason is not None
    assert "excluded keyword" in reason


def test_hard_filter_remote_only() -> None:
    profile = make_test_profile()
    job = make_test_job(location="New York, NY", remote=False)
    prefs = CandidatePreferences(remote_only=True)

    failed, reason = evaluate_hard_filters(job, profile, prefs)
    assert failed is True
    assert "not remote" in str(reason)

    # Remote job passes
    remote_job = make_test_job(location="Remote", remote=True)
    failed, reason = evaluate_hard_filters(remote_job, profile, prefs)
    assert failed is False
    assert reason is None


def test_hard_filter_location_preference() -> None:
    profile = make_test_profile()
    job = make_test_job(location="Berlin, Germany", remote=False)
    prefs = CandidatePreferences(location="San Francisco, CA")

    failed, reason = evaluate_hard_filters(job, profile, prefs)
    assert failed is True
    assert "does not match" in str(reason)


def test_hard_filter_experience_gap_beyond_tolerance() -> None:
    profile = make_test_profile(years=2.0)
    # Job requires 7 years, tolerance is 2.0 (gap is 5 > 2)
    job = make_test_job(
        title="Lead Principal Architect",
        seniority="lead",
        description="Must have 7+ years of experience in distributed systems.",
    )
    prefs = CandidatePreferences(experience_gap_tolerance_years=2.0)

    failed, reason = evaluate_hard_filters(job, profile, prefs)
    assert failed is True
    assert "exceeding candidate" in str(reason)


def test_hard_filter_work_authorization_sponsorship() -> None:
    profile = make_test_profile()
    job = make_test_job(
        description="Candidate must be a US Citizen. No visa sponsorship available."
    )
    prefs = CandidatePreferences(work_authorization="Needs Sponsorship")

    failed, reason = evaluate_hard_filters(job, profile, prefs)
    assert failed is True
    assert "visa sponsorship" in str(reason)
