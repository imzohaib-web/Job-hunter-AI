from __future__ import annotations

import io
import fitz
import pytest

from app.schemas.job import JobPosting
from app.schemas.profile import (
    Education,
    ParsedProfile,
    ProfileLink,
    ProfileSkill,
    Project,
    SkillGroup,
    WorkExperience,
)
from app.services.tailoring.ats_scorer import AtsScorer
from app.services.tailoring.docx_builder import build_pdf_resume, build_docx_resume, format_degree_title
from app.services.tailoring.evidence_mapper import SemanticEvidenceMapper
from app.services.tailoring.agent import ResumeTailorAgent


def create_candidate_zohaib() -> ParsedProfile:
    return ParsedProfile(
        name="Zohaib Umer",
        headline="Full-Stack Engineer",
        email="umerzohaibumer@gmail.com",
        phone="+92 300 1234567",
        location="Wah Cantt, Pakistan",
        links=[
            ProfileLink(label="GitHub", url="https://github.com/imzohaib-web"),
            ProfileLink(label="LinkedIn", url="https://linkedin.com/in/zohaib-umer"),
            ProfileLink(label="Portfolio", url="https://my-portfoliothree-plum-12.vercel.app/"),
        ],
        summary="Full-Stack Engineer with experience building scalable REST APIs and AI-driven platforms.",
        skill_groups=[
            SkillGroup(
                label="Backend",
                items=["Node.js", "Express.js", "FastAPI", "REST API design", "JWT authentication", "server-side architecture"],
            ),
            SkillGroup(
                label="Fundamentals",
                items=["Data Structures and Algorithms", "Object-Oriented Programming", "client-server architecture"],
            ),
            SkillGroup(
                label="Databases",
                items=["MongoDB (Mongoose)", "SQLite", "MySQL"],
            ),
            SkillGroup(
                label="Frontend",
                items=["React", "TypeScript", "JavaScript", "Vite", "Tailwind CSS"],
            ),
            SkillGroup(
                label="Languages",
                items=["Python", "JavaScript", "TypeScript", "Java", "C++"],
            ),
            SkillGroup(
                label="Tools & Deployment",
                items=["Git", "GitHub", "Postman", "pytest", "Vercel", "Render", "MongoDB Atlas"],
            ),
            SkillGroup(
                label="AI / LLM",
                items=["LLM API integration (Groq, Qwen via Alibaba Cloud Model Studio)", "RAG", "LangChain", "vector databases (FAISS, ChromaDB)"],
            ),
        ],
        skills=[
            ProfileSkill(name="FastAPI", category="Backend"),
            ProfileSkill(name="Node.js", category="Backend"),
            ProfileSkill(name="React", category="Frontend"),
            ProfileSkill(name="Python", category="Languages"),
            ProfileSkill(name="pytest", category="Tools"),
            ProfileSkill(name="Data Structures and Algorithms", category="Fundamentals"),
            ProfileSkill(name="JWT authentication", category="Backend"),
        ],
        experience=[
            WorkExperience(
                company="CareerPilot AI Team",
                title="Full-Stack Developer Intern",
                start="2026-06",
                end="2026-09",
                location="Remote",
                is_current=False,
                bullets=[
                    "Engineered 10 FastAPI routers and 27 endpoints on MongoDB covered by 162 pytest tests.",
                    "Implemented JWT auth with secure httpOnly cookies and role-based permissions.",
                    "Built full-stack responsive dashboard using React, TypeScript and Tailwind CSS.",
                ],
                technologies=["FastAPI", "React", "TypeScript", "MongoDB", "pytest", "JWT"],
            )
        ],
        projects=[
            Project(
                name="CareerPilot AI",
                context_line="Two-person team | Selected for the hackathon finale | React, TypeScript, FastAPI, MongoDB, Qwen",
                year="2026",
                tech_stack=["React", "TypeScript", "FastAPI", "MongoDB", "Qwen", "Vercel", "Render"],
                bullets=[
                    "Built a platform with six AI-driven modules: Resume Analyzer, Skill Gap Analysis, Personalized Roadmap, AI Career Mentor, AI Mock Interview and Progress Dashboard.",
                    "Backend of 10 FastAPI routers and 27 endpoints on MongoDB, covered by 162 pytest tests, with an offline fallback mode.",
                    "Owned the Auth, AI Resume Analyzer, Progress Dashboard and AI Career Mentor modules end to end.",
                    "Deployed with Vercel (frontend), Render (backend) and MongoDB Atlas.",
                ],
            ),
            Project(
                name="Enterprise LMS",
                context_line="Academic Project | Supervisor: Dr. Imran | Python, Django, PostgreSQL",
                year="2025",
                tech_stack=["Python", "Django", "PostgreSQL"],
                bullets=[
                    "Constructed student enrollment and grading portal supporting 500+ modules.",
                ],
            ),
        ],
        education=[
            Education(
                institution="COMSATS University Islamabad, Wah Campus",
                degree="BS Software Engineering",
                field_of_study="Software Engineering",
                start="2023",
                end="2027",
                expected=True,
                gpa="3.3",
                gpa_scale="4.0",
                coursework=["Data Structures & Algorithms", "Object-Oriented Programming", "Machine Learning", "Software Quality Engineering"],
            ),
            Education(
                institution="The Scholar Science College, Wah Cantt",
                degree="FSc Pre-Engineering",
                field_of_study="Pre-Engineering",
                start="2021",
                end="2023",
                expected=False,
            ),
        ],
    )


def create_elevenlabs_job() -> JobPosting:
    return JobPosting(
        source="arbeitnow",
        external_id="elevenlabs-platform-eng",
        title="Full-Stack Engineer (Backend Leaning) - Platform Engineering",
        company="ElevenLabs",
        location="Remote, Global Team",
        description="""
        We are seeking a Full-Stack Engineer (Backend Leaning) for our Platform Engineering team.
        You will build scalable backend services, internal tooling, and admin workspaces.
        
        Requirements:
        - Strong background in Backend engineering, REST APIs, and server-side architecture.
        - Solid understanding of Data Structures and algorithms.
        - Experience with Full-Stack development using TypeScript, React, and Python or Node.
        - Strong foundation in Test Design and automated testing with pytest or Jest.
        - Security fundamentals: authentication, token handling, and secure cookie storage.
        - Experience with Cloud deployment and microservices architecture.
        - Preferred: Knowledge of Enterprise Single Sign-On (SSO), OAuth, SCIM, and RBAC.
        - Nice to have: Experience deploying on Kubernetes and container orchestration.
        
        Benefits:
        - Remote arrangement with a Global Team.
        - Workspaces budget and Admin Tooling resources.
        - High-impact Enterprise features.
        """,
        skills_required=[
            "Backend",
            "REST APIs",
            "Data Structures",
            "Full-Stack",
            "Test Design",
            "Security",
            "Cloud",
            "OAuth",
            "SSO",
            "Kubernetes",
        ],
        url="https://elevenlabs.io/careers/platform-engineer",
    )


def test_noise_filtering_and_clean_requirements() -> None:
    job = create_elevenlabs_job()
    mapper = SemanticEvidenceMapper()
    cleaned = mapper.clean_job_requirements(job)
    terms = [r.term.lower() for r in cleaned]

    # Noise terms must be completely discarded
    assert "remote" not in terms
    assert "global team" not in terms
    assert "workspaces" not in terms
    assert "admin tooling" not in terms
    assert "resource services" not in terms
    assert "benefits" not in terms

    # Real skills must be kept
    assert any("data structure" in t for t in terms)
    assert any("backend" in t for t in terms)
    assert any("test" in t for t in terms)
    assert any("security" in t for t in terms)


@pytest.mark.asyncio
async def test_semantic_evidence_mapping_elevenlabs() -> None:
    candidate = create_candidate_zohaib()
    job = create_elevenlabs_job()
    mapper = SemanticEvidenceMapper()

    cleaned_reqs = mapper.clean_job_requirements(job)
    plan = await mapper.map_requirements_to_profile(candidate, cleaned_reqs)
    plan_dict = {item.keyword.lower(): item for item in plan}

    # Data Structures -> strong (present in Fundamentals skill group & coursework)
    ds_item = next((v for k, v in plan_dict.items() if "data structure" in k), None)
    assert ds_item is not None
    assert ds_item.support == "strong"

    # Full-Stack -> strong (present in headline and experience)
    fs_item = next((v for k, v in plan_dict.items() if "full-stack" in k or "full stack" in k), None)
    assert fs_item is not None
    assert fs_item.support == "strong"

    # Test Design / testing -> strong (pytest, 162 pytest tests)
    test_item = next((v for k, v in plan_dict.items() if "test" in k), None)
    assert test_item is not None
    assert test_item.support == "strong"

    # Security -> strong (JWT authentication, httpOnly cookies)
    sec_item = next((v for k, v in plan_dict.items() if "security" in k), None)
    assert sec_item is not None
    assert sec_item.support == "strong"

    # Backend & REST APIs -> strong
    backend_item = next((v for k, v in plan_dict.items() if "backend" in k), None)
    assert backend_item is not None
    assert backend_item.support == "strong"

    # OAuth / SSO -> partial (candidate has JWT auth, not enterprise SSO/OAuth)
    sso_item = next((v for k, v in plan_dict.items() if "sso" in k or "oauth" in k), None)
    if sso_item:
        assert sso_item.support == "partial"
        assert "jwt" in sso_item.explanation.lower() or "not enterprise" in sso_item.explanation.lower()

    # Kubernetes -> none (genuine gap)
    k8s_item = next((v for k, v in plan_dict.items() if "kubernetes" in k), None)
    assert k8s_item is not None
    assert k8s_item.support == "none"
    assert k8s_item.is_gap is True

    # "Enterprise LMS" project title must NOT satisfy "Enterprise" keyword
    ent_item = next((v for k, v in plan_dict.items() if k == "enterprise"), None)
    if ent_item:
        assert ent_item.support != "strong" or "lms" not in (ent_item.quote or "").lower()


def test_quote_verification_downgrades_fabricated_quotes() -> None:
    candidate = create_candidate_zohaib()
    mapper = SemanticEvidenceMapper()
    units = mapper.extract_evidence_units(candidate)
    units_dict = {u.id: u.text for u in units}

    # Valid verbatim quote
    assert mapper.verify_quote("162 pytest tests", "exp:0:bullet:0", units_dict) is True

    # Fabricated quote not in the unit text
    assert mapper.verify_quote("deployed on AWS EKS with Kubernetes", "exp:0:bullet:0", units_dict) is False


def test_retention_check_preserves_numbers_and_context() -> None:
    candidate = create_candidate_zohaib()
    agent = ResumeTailorAgent()

    # Simulate an LLM output that accidentally dropped numbers and context lines
    from app.services.tailoring.schemas import ResumeRewriteLLMOutput, RewrittenExperience, RewrittenBullet, RewrittenProject

    poisoned_output = ResumeRewriteLLMOutput(
        tailored_summary="Full-Stack Engineer with strong backend skills.",
        summary_source_fact_ref="profile.summary",
        summary_reason="Refined summary",
        experience=[
            RewrittenExperience(
                company="CareerPilot AI Team",
                title="Full-Stack Developer Intern",
                start="2026-06",
                end="2026-09",
                bullets=[
                    RewrittenBullet(
                        text="Engineered FastAPI routers and endpoints on MongoDB.",  # lost 10 and 27!
                        source_fact_ref="profile.experience[0].bullets[0]",
                        reason="Streamlined wording",
                    ),
                ],
                technologies=["FastAPI", "React"],
            )
        ],
        projects=[
            RewrittenProject(
                name="CareerPilot AI",
                context_line="",  # lost context line!
                bullets=[
                    RewrittenBullet(
                        text="Built a web platform with AI modules.",  # lost 6 modules and 162 pytest tests!
                        source_fact_ref="profile.projects[0].bullets[0]",
                        reason="Shortened",
                    ),
                ],
            ),
            # Missing "Enterprise LMS" project!
        ],
    )

    tailored_candidate = agent._assemble_tailored_profile(candidate, poisoned_output)
    clean_profile, restorations = agent.run_retention_check(candidate, tailored_candidate)

    # 1. Dropped numbers in experience restored
    exp_bullets = " ".join(clean_profile.experience[0].bullets)
    assert "10 FastAPI routers" in exp_bullets or "162 pytest tests" in exp_bullets

    # 2. Context line restored
    assert "Two-person team" in clean_profile.projects[0].context_line

    # 3. Missing project restored
    proj_names = [p.name for p in clean_profile.projects]
    assert "Enterprise LMS" in proj_names

    # 4. Restorations occurred
    assert len(restorations) > 0


def test_degree_deduplication_formatting() -> None:
    # Degree that repeats field: "BS Software Engineering" in "Software Engineering"
    formatted = format_degree_title("BS Software Engineering", "Software Engineering")
    assert formatted == "BS Software Engineering"
    assert "in Software Engineering" not in formatted

    # Degree distinct from field: "Bachelor of Science" in "Computer Science"
    formatted_distinct = format_degree_title("Bachelor of Science", "Computer Science")
    assert formatted_distinct == "Bachelor of Science in Computer Science"


def test_generated_pdf_fits_exactly_one_page() -> None:
    candidate = create_candidate_zohaib()
    pdf_buf = build_pdf_resume(candidate, target_job_title="Full-Stack Engineer (Backend Leaning)")
    pdf_bytes = pdf_buf.getvalue()
    assert len(pdf_bytes) > 1000

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = doc.page_count
    doc.close()

    assert page_count == 1, f"Expected exactly 1 page resume, but got {page_count} pages!"
