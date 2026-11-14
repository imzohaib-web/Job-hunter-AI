from __future__ import annotations

from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience
from app.services.tailoring.keyword_planner import KeywordPlanner


def create_test_profile() -> ParsedProfile:
    return ParsedProfile(
        name="Elena Rostova",
        summary=(
            "Senior Backend Engineer specializing in Python, FastAPI, and PostgreSQL microservices."
        ),
        skills=[
            ProfileSkill(name="Python", category="Languages", years=5.0),
            ProfileSkill(name="FastAPI", category="Frameworks", years=4.0),
            ProfileSkill(name="PostgreSQL", category="Databases", years=4.0),
            ProfileSkill(name="Docker", category="Cloud", years=3.0),
        ],
        experience=[
            WorkExperience(
                company="DataFlow Inc",
                title="Senior Python Developer",
                start="2021-03",
                end="Present",
                bullets=[
                    "Developed high-throughput REST APIs using Python and FastAPI serving 50k RPM.",
                    "Optimized PostgreSQL queries reducing latency by 35%.",
                ],
                technologies=["Python", "FastAPI", "PostgreSQL", "Docker"],
            )
        ],
    )


def test_keyword_planner_maps_existing_skills_and_flags_gaps() -> None:
    profile = create_test_profile()
    job = JobPosting(
        source="remotive",
        external_id="job-ai-1",
        title="Senior Python & Cloud Engineer",
        company="CloudScale",
        location="Remote",
        remote=True,
        skills_required=["Python", "FastAPI", "Kubernetes", "Rust"],
        description="""
        Requirements:
        - 5+ years of Python and FastAPI backend development.
        - Experience with Docker containerization and PostgreSQL databases.

        Nice to have:
        - Kubernetes orchestration experience.
        - Familiarity with Rust systems programming.
        """,
        url="https://example.com/job/1",
    )

    planner = KeywordPlanner()
    plan = planner.build_plan(profile, job)

    plan_by_kw = {item.keyword: item for item in plan}

    # Python, FastAPI, PostgreSQL, Docker must be mapped to verified evidence
    assert "Python" in plan_by_kw
    assert not plan_by_kw["Python"].is_gap
    assert plan_by_kw["Python"].evidence is not None
    assert "profile." in plan_by_kw["Python"].evidence

    assert "FastAPI" in plan_by_kw
    assert not plan_by_kw["FastAPI"].is_gap
    assert plan_by_kw["FastAPI"].evidence is not None

    assert "Docker" in plan_by_kw
    assert not plan_by_kw["Docker"].is_gap

    # Kubernetes and Rust are absent from candidate profile -> must be flagged as GAPS!
    assert "Kubernetes" in plan_by_kw
    assert plan_by_kw["Kubernetes"].is_gap
    assert plan_by_kw["Kubernetes"].evidence is None

    assert "Rust" in plan_by_kw
    assert plan_by_kw["Rust"].is_gap
    assert plan_by_kw["Rust"].evidence is None
