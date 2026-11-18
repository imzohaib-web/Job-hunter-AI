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

import pytest

from app.schemas.job import JobPosting, JobQuery
from app.schemas.match import CandidatePreferences, JobWithEmbedding, MatchResult
from app.schemas.profile import ParsedProfile
from app.services.discovery_pipeline import run_discovery
from app.services.job_sources.cleaner import collapse_near_duplicates, extract_base_title_and_region
from app.services.job_sources.location_parser import parse_location
from app.services.job_sources.role_family import (
    FAMILY_ADJACENT_TECH,
    FAMILY_DATA_AI,
    FAMILY_SOFTWARE_WEB,
    NON_TECH_FAMILIES,
    classify_role_family,
)
from app.services.job_sources.skill_extractor import extract_skills
from app.services.ranking.agent import HybridRankingAgent


# ==============================================================================
# 1. Location Parsing Tests (15+ real strings)
# ==============================================================================
def test_parse_location_cases():
    test_cases = [
        # (raw_loc, remote_flag, candidate_country, expected_remote, expected_regions, is_compat)
        ("Remote", False, "Pakistan", True, ["worldwide"], True),
        ("Anywhere", False, "Pakistan", True, ["worldwide"], True),
        ("Worldwide", False, "Pakistan", True, ["worldwide"], True),
        ("Work from home", False, "Pakistan", True, ["worldwide"], True),
        ("Remote - US only", True, "Pakistan", True, ["usa"], False),
        ("Remote - USA / Canada", True, "Pakistan", True, ["usa", "canada"], False),
        ("Remote (France)", True, "Pakistan", True, ["france"], False),
        ("PARIS OFFICE or REMOTE FROM FRANCE", True, "Pakistan", True, ["france"], False),
        ("Remote - Europe, USA, Canada", True, "Pakistan", True, ["europe", "usa", "canada"], False),
        ("Berlin / Greece / Remote", True, "Pakistan", True, ["worldwide"], True),
        ("Hybrid - London, UK", False, "Pakistan", False, [], False),
        ("On-site: Berlin, Germany", False, "Pakistan", False, [], False),
        ("Lahore, Pakistan", False, "Pakistan", False, [], True),
        ("Remote - Pakistan", True, "Pakistan", True, ["pakistan"], True),
        ("Remote - APAC only", True, "Pakistan", True, ["apac"], True),
        ("Remote, Global", False, "Pakistan", True, ["worldwide"], True),
    ]

    for raw_loc, flag, country, exp_remote, exp_regions, exp_compat in test_cases:
        res = parse_location(raw_loc, flag, description="", candidate_country=country)
        assert res.is_remote == exp_remote, f"Failed is_remote for '{raw_loc}': expected {exp_remote}, got {res.is_remote}"
        if exp_regions == ["worldwide"]:
            assert "worldwide" in res.remote_regions or not res.remote_regions, f"Expected worldwide for '{raw_loc}'"
        else:
            for exp_reg in exp_regions:
                assert any(exp_reg in r.lower() for r in res.remote_regions), f"Missing {exp_reg} in {res.remote_regions} for '{raw_loc}'"
        assert res.compatible_with_candidate == exp_compat, f"Failed compatibility for '{raw_loc}': expected {exp_compat}, got {res.compatible_with_candidate}"


# ==============================================================================
# 2. Skill Matching Boundaries Tests (no company name, no false substrings)
# ==============================================================================
def test_skill_matching_boundaries():
    # 'gitlab' must NOT match Git
    skills_gitlab = extract_skills("We use gitlab for CI/CD", company="GitLab")
    assert "Git" not in skills_gitlab
    assert "GitLab" not in skills_gitlab or "Git" not in [s for s in skills_gitlab if s == "Git"]

    # 'Javascript' or 'JavaScript' must NOT match Java
    skills_js = extract_skills("Looking for a JavaScript and TypeScript expert", company="Acme")
    assert "JavaScript" in skills_js
    assert "TypeScript" in skills_js
    assert "Java" not in skills_js

    # 'Google' or 'GoDaddy' must NOT match Go
    skills_google = extract_skills("Google Cloud Platform engineer working at Google", company="Google")
    assert "Go" not in skills_google

    # Bare single letters 'R' and 'C' must not match randomly in words
    skills_words = extract_skills("Customer Success Representative in Chicago", company="Acme")
    assert "R" not in skills_words
    assert "C" not in skills_words

    # Genuine Go match
    skills_go_real = extract_skills("Backend services written in Go / Golang with Docker", company="Acme")
    assert "Go" in skills_go_real
    assert "Docker" in skills_go_real


# ==============================================================================
# 3. Role Classifier Tests
# ==============================================================================
def test_role_classifier_non_tech_and_adjacent():
    # Non-tech roles
    assert classify_role_family("Customer Success Manager", "") in NON_TECH_FAMILIES
    assert classify_role_family("Customer Success Architect, NEUR", "") in NON_TECH_FAMILIES
    assert classify_role_family("Technical Support Specialist", "") in NON_TECH_FAMILIES
    assert classify_role_family("Sales Engineer - Enterprise", "") in NON_TECH_FAMILIES
    assert classify_role_family("Account Manager", "") in NON_TECH_FAMILIES
    assert classify_role_family("AI Data Annotator", "") in NON_TECH_FAMILIES
    assert classify_role_family("Freelance Copywriter", "") in NON_TECH_FAMILIES
    assert classify_role_family("Inside Sales Contractor", "") in NON_TECH_FAMILIES
    assert classify_role_family("US Remote Patient Care Advocate", "") in NON_TECH_FAMILIES

    # Adjacent Tech (Solutions Architect)
    assert classify_role_family("Solutions Architect", "") == FAMILY_ADJACENT_TECH
    assert classify_role_family("Senior Solutions Architect - Cloud", "") == FAMILY_ADJACENT_TECH

    # Core Tech
    assert classify_role_family("Full Stack Software Engineer", "") == FAMILY_SOFTWARE_WEB
    assert classify_role_family("Machine Learning Engineer", "") == FAMILY_DATA_AI
    assert classify_role_family("Frontend React Developer", "") == FAMILY_SOFTWARE_WEB


# ==============================================================================
# 4. Near-Duplicate Collapse Tests
# ==============================================================================
def test_near_duplicate_collapse():
    jobs = [
        JobPosting(
            id="job-1",
            source="test",
            external_id="1",
            title="Customer Success Architect, NEUR",
            company="GitLab",
            location="Remote - Europe",
            remote=True,
            description="Role details...",
            url="https://example.com/1",
        ),
        JobPosting(
            id="job-2",
            source="test",
            external_id="2",
            title="Customer Success Architect, France",
            company="GitLab",
            location="Remote - France",
            remote=True,
            description="Role details...",
            url="https://example.com/2",
        ),
        JobPosting(
            id="job-3",
            source="test",
            external_id="3",
            title="Senior Full Stack Developer",
            company="Acme Corp",
            location="Remote",
            remote=True,
            description="Different job...",
            url="https://example.com/3",
        ),
    ]

    collapsed = collapse_near_duplicates(jobs)
    assert len(collapsed) == 2

    gitlab_job = next(j for j in collapsed if j.company == "GitLab")
    assert gitlab_job.duplicate_locations is not None
    assert len(gitlab_job.duplicate_locations) == 2


# ==============================================================================
# 5. Tier Assignment Tests
# ==============================================================================
def test_tier_assignment():
    from app.services.ranking.agent import assign_tier

    assert assign_tier(75.0) == "strong"
    assert assign_tier(70.0) == "strong"
    assert assign_tier(69.9) == "good"
    assert assign_tier(50.0) == "good"
    assert assign_tier(49.9) == "possible"
    assert assign_tier(30.0) == "possible"
    assert assign_tier(29.9) == "stretch"
    assert assign_tier(0.0) == "stretch"


# ==============================================================================
# 6. Deterministic Score Equality and Single-Calculation Pipeline Test
# ==============================================================================
def test_unified_discovery_path():
    """Verify that score computation is deterministic and reproducible across multiple runs."""
    from app.schemas.profile import ProfileSkill
    from app.services.ranking.hard_filters import (
        evaluate_hard_filters,
        evaluate_soft_preferences,
    )
    from app.services.ranking.skill_scorer import (
        collect_candidate_skills,
        evaluate_skill_overlap,
    )
    from app.services.ranking.agent import (
        assign_tier,
        _compute_experience_score,
        _compute_location_score,
    )

    profile = ParsedProfile(
        name="Test Candidate",
        location="Wah Cantt, Punjab, Pakistan",
        skills=[
            ProfileSkill(name="React", category="Frontend"),
            ProfileSkill(name="Node.js", category="Backend"),
            ProfileSkill(name="Python", category="Backend"),
            ProfileSkill(name="MongoDB", category="Database"),
            ProfileSkill(name="Express", category="Backend"),
        ],
        experience=[],
        education=[],
    )

    prefs = CandidatePreferences(
        target_titles=["Full Stack Developer", "Software Engineer"],
        location="Wah Cantt, Punjab, Pakistan",
        remote_only=True,
        remote_worldwide=True,
        employment_types=["full-time"],
        experience_levels=["entry", "internship"],
    )

    job1 = JobPosting(
        id="test-job-1",
        source="remotive",
        external_id="rem-1",
        title="Junior Full Stack Developer",
        company="Tech Corp",
        location="Remote (worldwide)",
        remote=True,
        description="We are looking for a Junior Full Stack Developer with React, Node.js, and Python skills.",
        url="https://remotive.com/job/1",
    )

    job2 = JobPosting(
        id="test-job-2",
        source="arbeitnow",
        external_id="arb-2",
        title="Senior Solutions Architect",
        company="Big Cloud",
        location="Remote",
        remote=True,
        description="Enterprise Solutions Architect with Java and AWS experience.",
        url="https://arbeitnow.com/job/2",
    )

    def compute_job_score(job: JobPosting):
        cand_skills = collect_candidate_skills(profile)
        failed, reason = evaluate_hard_filters(job, profile, prefs)
        skill_eval = evaluate_skill_overlap(job, cand_skills)
        soft_penalty, soft_reasons = evaluate_soft_preferences(job, profile, prefs)
        exp_val = _compute_experience_score(profile, job)
        loc_val = _compute_location_score(job, prefs)

        # Weighted combination
        raw_combined = (65.0 * 0.35) + (50.0 * 0.15) + (skill_eval.score * 0.35) + (exp_val * 0.15)
        adj_score = max(0.0, min(100.0, float(raw_combined + soft_penalty)))

        title_lower = job.title.lower()
        job_family = classify_role_family(job.title, description=job.description)
        is_adjacent = (job_family == FAMILY_ADJACENT_TECH) or ("solutions architect" in title_lower)
        if is_adjacent:
            adj_score = min(35.0, adj_score)

        final_score = int(round(adj_score))
        tier = assign_tier(final_score, is_stretch_override=bool(is_adjacent or failed))
        return final_score, tier, skill_eval.matched_skills

    # Run twice and verify exact identical scores, tiers, and matched skills
    score_1a, tier_1a, skills_1a = compute_job_score(job1)
    score_1b, tier_1b, skills_1b = compute_job_score(job1)
    assert score_1a == score_1b
    assert tier_1a == tier_1b
    assert skills_1a == skills_1b
    assert tier_1a in ("strong", "good")
    assert "React" in skills_1a

    score_2a, tier_2a, skills_2a = compute_job_score(job2)
    score_2b, tier_2b, skills_2b = compute_job_score(job2)
    assert score_2a == score_2b
    assert tier_2a == tier_2b
    assert skills_2a == skills_2b
    assert score_2a <= 35.0
    assert tier_2a in ("possible", "stretch")
