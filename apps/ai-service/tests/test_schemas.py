from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.company import CompanyInsight
from app.schemas.envelopes import (
    ApiMeta,
    ParseResumeRequest,
    ParseResumeResponse,
    SearchJobsResponse,
)
from app.schemas.fabrication import FabricationReport, UnsupportedClaim
from app.schemas.job import JobPosting, JobQuery, SearchJobsResult, SourceStatus
from app.schemas.match import MatchResult, MatchScoreBreakdown
from app.schemas.profile import (
    Education,
    LanguageProficiency,
    ParsedProfile,
    ProfileSkill,
    Project,
    WorkExperience,
)
from app.schemas.tailoring import (
    AtsReport,
    AtsSectionCheck,
    ResumeChange,
    TailoredResume,
)


def create_sample_profile() -> ParsedProfile:
    return ParsedProfile(
        name="Jane Doe",
        email="jane.doe@example.com",
        phone="+1-555-0100",
        location="San Francisco, CA",
        links=["https://linkedin.com/in/janedoe"],
        summary="Experienced AI Engineer",
        skills=[
            ProfileSkill(name="Python", category="Languages", years=5.0, evidence="Built APIs")
        ],
        experience=[
            WorkExperience(
                company="TechCorp",
                title="Senior AI Engineer",
                start="2021-01",
                end="Present",
                bullets=["Built LLM inference pipelines"],
                technologies=["FastAPI", "Python"],
            )
        ],
        education=[
            Education(
                institution="Stanford University",
                degree="BS",
                field_of_study="Computer Science",
            )
        ],
        projects=[
            Project(
                name="JobPilot",
                description="AI career agent",
                technologies=["Python", "React"],
            )
        ],
        languages=[LanguageProficiency(language="English", proficiency="native")],
        field_confidence={"name": 0.99, "email": 0.95},
    )


def create_sample_job() -> JobPosting:
    return JobPosting(
        source="adzuna",
        external_id="job-12345",
        title="AI Engineer",
        company="RoboTech",
        location="Remote",
        remote=True,
        salary_min=130000.0,
        salary_max=160000.0,
        currency="USD",
        description="We are hiring an AI Engineer proficient in Python.",
        url="https://example.com/job/12345",
        skills_required=["Python", "FastAPI"],
    )


def test_parsed_profile_valid() -> None:
    profile = create_sample_profile()
    assert profile.name == "Jane Doe"
    assert profile.email == "jane.doe@example.com"
    assert profile.skills[0].name == "Python"
    assert profile.field_confidence["name"] == 0.99


def test_parsed_profile_email_validation() -> None:
    with pytest.raises(ValidationError) as exc:
        ParsedProfile(
            name="John Doe",
            email="not-an-email",
        )
    assert "Invalid email address format" in str(exc.value)


def test_parsed_profile_confidence_bounds() -> None:
    with pytest.raises(ValidationError) as exc:
        ParsedProfile(
            name="John Doe",
            field_confidence={"name": 1.5},
        )
    assert "must be between 0.0 and 1.0" in str(exc.value)


def test_job_posting_valid() -> None:
    job = create_sample_job()
    assert job.company == "RoboTech"
    assert job.currency == "USD"


def test_job_posting_salary_range_validation() -> None:
    with pytest.raises(ValidationError) as exc:
        JobPosting(
            source="manual",
            external_id="1",
            title="Dev",
            company="Co",
            location="Remote",
            salary_min=150000.0,
            salary_max=120000.0,  # min > max
            currency="USD",
            description="desc",
            url="https://example.com",
        )
    assert "salary_max" in str(exc.value) and "less than salary_min" in str(exc.value)


def test_job_posting_currency_validation() -> None:
    with pytest.raises(ValidationError) as exc:
        JobPosting(
            source="manual",
            external_id="1",
            title="Dev",
            company="Co",
            location="Remote",
            currency="US-DOLLARS",  # not 3 letters
            description="desc",
            url="https://example.com",
        )
    assert "3-letter ISO code" in str(exc.value)


def test_match_result_valid() -> None:
    result = MatchResult(
        job_id="job-12345",
        overall_score=85,
        breakdown=MatchScoreBreakdown(
            semantic=88.0,
            keyword=82.0,
            skills=90.0,
            experience=80.0,
            location=100.0,
        ),
        matched_skills=["Python"],
        missing_skills=[],
        explanation="Strong fit across core dimensions.",
    )
    assert result.overall_score == 85
    assert not result.hard_filter_failed


def test_match_result_explanation_length() -> None:
    long_explanation = "A" * 401
    with pytest.raises(ValidationError) as exc:
        MatchResult(
            job_id="job-1",
            overall_score=75,
            breakdown=MatchScoreBreakdown(
                semantic=70.0,
                keyword=70.0,
                skills=70.0,
                experience=70.0,
                location=70.0,
            ),
            explanation=long_explanation,
        )
    assert "Explanation exceeds maximum allowed length" in str(
        exc.value
    ) or "at most 400 characters" in str(exc.value)


def test_match_result_hard_filter_requires_reason() -> None:
    with pytest.raises(ValidationError) as exc:
        MatchResult(
            job_id="job-1",
            overall_score=0,
            breakdown=MatchScoreBreakdown(
                semantic=0.0, keyword=0.0, skills=0.0, experience=0.0, location=0.0
            ),
            explanation="Requires citizenship",
            hard_filter_failed=True,
            hard_filter_reason=None,
        )
    assert "hard_filter_reason must be provided" in str(exc.value)


def test_company_insight_confidence_validation() -> None:
    insight = CompanyInsight(
        summary="Robotics startup",
        tech_stack=["Python"],
        culture_signals=["Fast paced"],
        confidence=0.85,
    )
    assert insight.confidence == 0.85

    with pytest.raises(ValidationError) as exc:
        CompanyInsight(
            summary="Robotics startup",
            confidence=1.2,
        )
    assert "less than or equal to 1" in str(exc.value) or "Confidence score must be between" in str(
        exc.value
    )


def test_tailored_resume_valid() -> None:
    profile = create_sample_profile()
    change = ResumeChange(
        section="experience",
        before="Built APIs",
        after="Architected high-throughput FastAPI microservices",
        reason="Match job focus on FastAPI",
        source_fact_ref="profile.experience[0].bullets[0]",
    )
    ats = AtsReport(
        keyword_coverage=85.0,
        missing_keywords=["Kubernetes"],
        section_checks=[
            AtsSectionCheck(section="experience", status="pass", feedback="Strong metrics")
        ],
    )
    tailored = TailoredResume(sections=profile, changes=[change], ats_report=ats)
    assert len(tailored.changes) == 1
    assert tailored.ats_report.keyword_coverage == 85.0


def test_tailored_resume_empty_source_fact_ref_rejected() -> None:
    with pytest.raises(ValidationError) as exc:
        ResumeChange(
            section="experience",
            before="Old text",
            after="New text",
            reason="Better",
            source_fact_ref="   ",  # empty ref violation of hard rule 4
        )
    assert "cannot be empty" in str(exc.value)


def test_ats_section_check_status_validation() -> None:
    with pytest.raises(ValidationError) as exc:
        AtsSectionCheck(
            section="summary",
            status="invalid-status",
            feedback="test",
        )
    assert "must be one of 'pass', 'warning', 'fail'" in str(exc.value)


def test_fabrication_report_passed_consistency() -> None:
    # 0 unsupported claims automatically sets passed=True
    report_clean = FabricationReport(claims_checked=10, unsupported_claims=[], passed=False)
    assert report_clean.passed is True

    # Claims with passed=True raises ValidationError
    with pytest.raises(ValidationError) as exc:
        FabricationReport(
            claims_checked=5,
            unsupported_claims=[UnsupportedClaim(text="Invented skill", location="summary")],
            passed=True,
        )
    assert "passed cannot be True when" in str(exc.value)


def test_api_meta_and_envelopes() -> None:
    meta = ApiMeta(duration_ms=125.0)
    assert meta.duration_ms == 125.0
    assert len(meta.request_id) > 10
    assert "T" in meta.timestamp

    profile = create_sample_profile()
    resp = ParseResumeResponse(data=profile, meta=meta)
    assert resp.data.name == "Jane Doe"
    assert resp.meta.duration_ms == 125.0

    req = ParseResumeRequest(resume_text="Sample text")
    assert req.resume_text == "Sample text"


def test_job_query_and_search_schemas() -> None:
    query = JobQuery(keywords="Python", location="Remote", limit=25)
    assert query.keywords == "Python"
    assert query.limit == 25

    status = SourceStatus(source="remotive", status="ok", count=5, duration_ms=100.0)
    assert status.status == "ok"

    result = SearchJobsResult(
        jobs=[create_sample_job()],
        total=1,
        sources_responded=1,
        sources_total=1,
        source_statuses=[status],
    )
    assert result.total == 1
    assert result.jobs[0].is_demo is False

    response = SearchJobsResponse(data=result)
    assert response.data.total == 1


def test_ranking_schemas() -> None:
    from app.schemas.match import (
        CandidatePreferences,
        JobWithEmbedding,
        RankedJobItem,
        RankingWeights,
        RankRequest,
        RankResponseData,
    )

    weights = RankingWeights(semantic=0.35, keyword=0.20, skills=0.30, experience=0.15)
    assert weights.semantic == 0.35

    prefs = CandidatePreferences(remote_only=True, excluded_companies=["EvilCorp"])
    assert prefs.remote_only is True
    assert "EvilCorp" in prefs.excluded_companies

    job = create_sample_job()
    job_item = JobWithEmbedding(job=job, embedding=[0.5] * 384)
    assert len(job_item.embedding or []) == 384

    profile = create_sample_profile()
    req = RankRequest(profile=profile, jobs=[job_item], preferences=prefs)
    assert len(req.jobs) == 1

    match_res = MatchResult(
        job_id="job-12345",
        overall_score=85,
        breakdown=MatchScoreBreakdown(
            semantic=85.0, keyword=80.0, skills=90.0, experience=85.0, location=100.0
        ),
        matched_skills=["Python"],
        missing_skills=[],
        explanation="Great fit",
    )
    ranked_item = RankedJobItem(job=job, match=match_res, embedding=[0.5] * 384)
    data = RankResponseData(
        ranked_jobs=[ranked_item],
        total=1,
        unfiltered_count=1,
        hard_filtered_count=0,
        new_embeddings_generated=0,
    )
    assert data.total == 1
    assert data.ranked_jobs[0].match.overall_score == 85
