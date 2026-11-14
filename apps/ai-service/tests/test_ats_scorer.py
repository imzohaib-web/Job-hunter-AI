from __future__ import annotations

from app.schemas.profile import ParsedProfile, ProfileSkill, WorkExperience
from app.schemas.tailoring import KeywordPlanItem
from app.services.tailoring.ats_scorer import AtsScorer


def test_ats_scorer_full_evaluation() -> None:
    profile = ParsedProfile(
        name="Sarah Connor",
        email="sarah@example.com",
        phone="+1-555-0100",
        summary="Experienced Python engineer building scalable APIs and distributed systems.",
        skills=[
            ProfileSkill(name="Python", category="Languages"),
            ProfileSkill(name="FastAPI", category="Frameworks"),
            ProfileSkill(name="Docker", category="DevOps"),
            ProfileSkill(name="PostgreSQL", category="Databases"),
            ProfileSkill(name="Redis", category="Databases"),
        ],
        experience=[
            WorkExperience(
                company="Cyberdyne Tech",
                title="Systems Engineer",
                start="2020-01",
                end="Present",
                bullets=[
                    "Engineered Python backend services handling millions of events daily.",
                    "Implemented Docker containerization for automated CI/CD deployments.",
                ],
                technologies=["Python", "Docker", "PostgreSQL"],
            )
        ],
    )

    keyword_plan = [
        KeywordPlanItem(
            keyword="Python", category="required", evidence="profile.skills[0]", is_gap=False
        ),
        KeywordPlanItem(
            keyword="Docker", category="required", evidence="profile.skills[2]", is_gap=False
        ),
        KeywordPlanItem(keyword="Kubernetes", category="preferred", evidence=None, is_gap=True),
        KeywordPlanItem(keyword="Rust", category="preferred", evidence=None, is_gap=True),
    ]

    scorer = AtsScorer()
    report = scorer.evaluate(profile, keyword_plan)

    # 1. Keyword coverage: 2 matched out of 4 = 50.0%
    assert report.keyword_coverage == 50.0
    assert "Kubernetes" in report.missing_keywords
    assert "Rust" in report.missing_keywords
    assert "Python" not in report.missing_keywords

    # 2. Section checks
    section_map = {check.section: check for check in report.section_checks}
    assert "contact" in section_map
    assert section_map["contact"].status == "pass"

    assert "summary" in section_map
    assert section_map["summary"].status == "pass"

    assert "experience" in section_map
    assert section_map["experience"].status == "pass"

    assert "skills" in section_map
    assert section_map["skills"].status == "pass"

    # 3. Length and word count
    assert report.word_count > 0
    assert "words" in report.length_check

    # 4. Formatting warnings
    assert len(report.formatting_warnings) >= 1
    assert any("Single-column" in w for w in report.formatting_warnings)
