from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.graphs.checkpointer import reset_checkpointer
from app.graphs.events import event_manager
from app.graphs.node_wrapper import FatalNodeError
from app.graphs.runner import run_manager
from app.schemas.company import CompanyInsight
from app.schemas.cover_letter import CoverLetter
from app.schemas.fabrication import FabricationReport, UnsupportedClaim
from app.schemas.interview import (
    BehavioralQuestion,
    InterviewPack,
    QuestionToAsk,
    StarAnswer,
    TechnicalQuestion,
)
from app.schemas.job import JobPosting, SearchJobsResult, SourceStatus
from app.schemas.match import (
    MatchResult,
    MatchScoreBreakdown,
    RankedJobItem,
    RankResponseData,
)
from app.schemas.profile import (
    ParsedProfile,
    ProfileSkill,
    WorkExperience,
)
from app.schemas.tailoring import (
    AtsReport,
    AtsSectionCheck,
    KeywordPlanItem,
    ResumeChange,
    TailoredResume,
)
from app.services.company_research import CompanyResearchAgent
from app.services.cover_letter import CoverLetterAgent
from app.services.interview_prep import InterviewPrepAgent
from app.services.job_sources import JobSourceAggregator
from app.services.ranking import HybridRankingAgent
from app.services.tailoring import ResumeTailorAgent

# ── Test Fixtures & Factories ───────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def clean_graph_state() -> None:
    """Reset checkpoint storage, active runs, and event bus between test executions."""
    reset_checkpointer()
    run_manager.clear()
    event_manager.clear()


def make_test_profile(name: str = "Jane Developer") -> ParsedProfile:
    return ParsedProfile(
        name=name,
        email="jane.dev@example.com",
        summary="Senior AI Platform Engineer with 5 years building scalable ML microservices.",
        skills=[
            ProfileSkill(name="Python", category="technical"),
            ProfileSkill(name="FastAPI", category="technical"),
            ProfileSkill(name="Kubernetes", category="tools"),
        ],
        experience=[
            WorkExperience(
                company="TechCorp",
                title="Senior AI Engineer",
                start="2022-01",
                end="Present",
                bullets=[
                    "Engineered real-time LLM inference services with FastAPI under 200ms latency.",
                    "Orchestrated distributed Kubernetes clusters reducing downtime by 30%.",
                ],
                technologies=["Python", "FastAPI", "Docker", "Kubernetes"],
            )
        ],
        education=[],
        projects=[],
        certifications=[],
        languages=[],
    )


def make_test_job(title: str = "AI Engineer", company: str = "Acme Robotics") -> JobPosting:
    return JobPosting(
        source="adzuna",
        external_id="job-robotics-001",
        title=title,
        company=company,
        location="Remote",
        description="Looking for an AI Engineer experienced in Python, FastAPI, and Kubernetes.",
        required_skills=["Python", "FastAPI", "Kubernetes"],
        url="https://acmerobotics.example.com/careers/1",
    )


def make_test_company_insight(confidence: float = 0.90) -> CompanyInsight:
    return CompanyInsight(
        company_name="Acme Robotics",
        summary="Acme Robotics develops intelligent autonomous cloud platforms.",
        products_or_services=["RoboCloud", "Automation Suite"],
        industry="Enterprise Software & Robotics",
        tech_stack=["Python", "FastAPI", "AWS", "Kubernetes"],
        culture_signals=["Engineering-first", "Remote-friendly"],
        size_estimate="100-500",
        applicant_notes=["Highlight low-latency distributed systems experience."],
        sources=["https://acmerobotics.example.com"],
        confidence=confidence,
    )


def make_test_tailored_resume(passed_fabrication: bool = True) -> TailoredResume:
    profile = make_test_profile()
    unsupported = (
        []
        if passed_fabrication
        else [
            UnsupportedClaim(
                text="Invented Quantum Computing Lead title",
                location="experience[0].title",
                reason="Not in verified profile",
            )
        ]
    )
    fab_report = FabricationReport(
        claims_checked=10,
        unsupported_claims=unsupported,
        passed=passed_fabrication,
    )

    return TailoredResume(
        sections=profile,
        changes=[
            ResumeChange(
                section="experience",
                before="Engineered real-time LLM inference services",
                after=("Architected resilient real-time LLM inference pipelines with FastAPI"),
                reason="Align with Acme Robotics requirements",
                source_fact_ref="profile.experience[0].bullets[0]",
            )
        ],
        keyword_plan=[
            KeywordPlanItem(
                keyword="FastAPI",
                category="required",
                evidence="profile.experience[0].bullets[0]",
                is_gap=False,
            )
        ],
        ats_report=AtsReport(
            keyword_coverage=95.0,
            missing_keywords=[],
            section_checks=[
                AtsSectionCheck(section="experience", status="pass", feedback="Strong alignment")
            ],
        ),
        fabrication_report=fab_report,
    )


def make_test_cover_letter() -> CoverLetter:
    return CoverLetter(
        paragraphs=[
            "Dear Hiring Team at Acme Robotics,",
            (
                "I am excited to apply for the AI Engineer role. Over the past 5 years, "
                "I have built low-latency Python and FastAPI microservices."
            ),
            "I look forward to discussing how my experience can support Acme Robotics.",
        ],
        word_count=52,
        claims_used=[
            "5 years building scalable ML microservices",
            "Engineered real-time LLM inference services",
        ],
    )


def make_test_interview_pack() -> InterviewPack:
    return InterviewPack(
        behavioral=[
            BehavioralQuestion(
                question="Tell me about a time you reduced service latency.",
                star_answer=StarAnswer(
                    situation="At TechCorp, our real-time LLM services faced latency spikes.",
                    task="Lower latency below 200ms.",
                    action="Implemented an async connection pool in FastAPI.",
                    result="Reduced latency by 40% and improved throughput.",
                ),
                based_on="TechCorp Experience",
            )
        ],
        technical=[
            TechnicalQuestion(
                question="How do you ensure zero-fabrication in LLM responses?",
                answer="By enforcing strict Pydantic validation and audit passes.",
                difficulty="medium",
            )
        ],
        role_specific=[],
        questions_to_ask=[
            QuestionToAsk(
                question="How do you manage model lifecycle and monitoring?",
                target_audience="Hiring Manager",
                rationale="Shows engineering rigor.",
            )
        ],
    )


# ── Discovery Graph Tests ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_discovery_graph_happy_path_skips_verified_profile(
    async_client: AsyncClient,
    service_key: str,
) -> None:
    profile = make_test_profile()
    job = make_test_job()

    mock_aggregator = AsyncMock(
        return_value=SearchJobsResult(
            jobs=[job],
            total_found=1,
            returned=1,
            sources_queried=["adzuna"],
            source_statuses=[SourceStatus(source="adzuna", status="success", count=1)],
        )
    )
    mock_ranking = AsyncMock(
        return_value=RankResponseData(
            ranked_jobs=[
                RankedJobItem(
                    job=job,
                    match=MatchResult(
                        job_id=job.external_id,
                        overall_score=92,
                        breakdown=MatchScoreBreakdown(
                            semantic=90.0,
                            keyword=88.0,
                            skills=95.0,
                            experience=90.0,
                            location=100.0,
                        ),
                        matched_skills=["Python", "FastAPI"],
                        missing_skills=[],
                        explanation="Strong candidate match.",
                    ),
                )
            ],
            total=1,
            unfiltered_count=1,
            hard_filtered_count=0,
            new_embeddings_generated=0,
        )
    )

    with (
        patch.object(JobSourceAggregator, "aggregate", mock_aggregator),
        patch.object(HybridRankingAgent, "rank_jobs", mock_ranking),
    ):
        res = await async_client.post(
            "/v1/graphs/discovery",
            headers={"X-Service-Key": service_key},
            json={
                "profile": profile.model_dump(),
                "query": {
                    "job_titles": ["AI Engineer"],
                    "locations": ["Remote"],
                },
            },
        )
        assert res.status_code == 202
        run_id = res.json()["run_id"]

        # Wait for background task to complete
        for _ in range(100):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["status"] in ("completed", "failed", "stopped"):
                break

        print("DEBUG SNAP:", json.dumps(snap, indent=2))
        assert snap["status"] == "completed"
        assert snap["node_status"]["parse_profile"] == "skipped"
        assert snap["node_status"]["search_jobs"] == "done"
        assert snap["node_status"]["rank_jobs"] == "done"
        assert snap["node_status"]["assemble_discovery"] == "done"
        assert snap["state"]["completed"] is True


@pytest.mark.asyncio
async def test_discovery_graph_parses_resume_when_profile_missing(
    async_client: AsyncClient,
    service_key: str,
) -> None:
    profile = make_test_profile()
    job = make_test_job()

    mock_parser = AsyncMock()
    mock_parser.return_value.profile = profile
    mock_parser.return_value.warnings = []

    mock_aggregator = AsyncMock(
        return_value=SearchJobsResult(
            jobs=[job],
            total_found=1,
            returned=1,
            sources_queried=["adzuna"],
            source_statuses=[SourceStatus(source="adzuna", status="success", count=1)],
        )
    )
    mock_ranking = AsyncMock(
        return_value=RankResponseData(
            ranked_jobs=[
                RankedJobItem(
                    job=job,
                    match=MatchResult(
                        job_id=job.external_id,
                        overall_score=90,
                        breakdown=MatchScoreBreakdown(
                            semantic=90.0,
                            keyword=90.0,
                            skills=90.0,
                            experience=90.0,
                            location=100.0,
                        ),
                        matched_skills=["Python"],
                        missing_skills=[],
                        explanation="Solid candidate fit.",
                    ),
                )
            ],
            total=1,
            unfiltered_count=1,
            hard_filtered_count=0,
            new_embeddings_generated=0,
        )
    )

    with (
        patch("app.graphs.discovery.parse_resume_content", mock_parser),
        patch.object(JobSourceAggregator, "aggregate", mock_aggregator),
        patch.object(HybridRankingAgent, "rank_jobs", mock_ranking),
    ):
        res = await async_client.post(
            "/v1/graphs/discovery",
            headers={"X-Service-Key": service_key},
            json={
                "resume_text": "Jane Developer\nExperienced Python and FastAPI Engineer",
                "query": {
                    "job_titles": ["AI Engineer"],
                    "locations": ["Remote"],
                },
            },
        )
        assert res.status_code == 202
        run_id = res.json()["run_id"]

        for _ in range(100):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["status"] in ("completed", "failed", "stopped"):
                break

        print("DEBUG SNAP:", json.dumps(snap, indent=2))
        assert snap["status"] == "completed"
        assert snap["node_status"]["parse_profile"] == "done"
        assert snap["node_status"]["search_jobs"] == "done"
        assert snap["node_status"]["rank_jobs"] == "done"


# ── Prepare Application Graph Tests ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_prepare_application_happy_path(
    async_client: AsyncClient,
    service_key: str,
) -> None:
    profile = make_test_profile()
    job = make_test_job()

    mock_research = AsyncMock(return_value=make_test_company_insight(confidence=0.92))
    mock_tailor = AsyncMock(return_value=make_test_tailored_resume(passed_fabrication=True))
    mock_cover = AsyncMock(return_value=make_test_cover_letter())
    mock_prep = AsyncMock(return_value=make_test_interview_pack())

    with (
        patch.object(CompanyResearchAgent, "research", mock_research),
        patch.object(ResumeTailorAgent, "tailor_resume", mock_tailor),
        patch.object(CoverLetterAgent, "generate_cover_letter", mock_cover),
        patch.object(InterviewPrepAgent, "generate_interview_pack", mock_prep),
    ):
        res = await async_client.post(
            "/v1/graphs/prepare-application",
            headers={"X-Service-Key": service_key},
            json={
                "profile": profile.model_dump(),
                "job": job.model_dump(),
                "company_name": "Acme Robotics",
                "company_website": "https://acmerobotics.example.com",
            },
        )
        assert res.status_code == 202
        run_id = res.json()["run_id"]

        for _ in range(100):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["status"] in ("completed", "failed", "stopped"):
                break

        print("DEBUG SNAP:", json.dumps(snap, indent=2))
        assert snap["status"] == "completed"
        final_res = snap["state"]["final_result"]
        assert final_res["status"] == "success"
        assert final_res["document_generated"] is True
        assert final_res["fabrication_failed"] is False
        assert final_res["tailored_resume"] is not None
        assert final_res["cover_letter"] is not None
        assert final_res["interview_pack"] is not None


@pytest.mark.asyncio
async def test_prepare_application_company_research_failure_continues(
    async_client: AsyncClient,
    service_key: str,
) -> None:
    profile = make_test_profile()
    job = make_test_job()

    # Research agent fails with exception
    mock_research = AsyncMock(side_effect=RuntimeError("Web fetch network timeout"))
    mock_tailor = AsyncMock(return_value=make_test_tailored_resume(passed_fabrication=True))
    mock_cover = AsyncMock(return_value=make_test_cover_letter())
    mock_prep = AsyncMock(return_value=make_test_interview_pack())

    with (
        patch.object(CompanyResearchAgent, "research", mock_research),
        patch.object(ResumeTailorAgent, "tailor_resume", mock_tailor),
        patch.object(CoverLetterAgent, "generate_cover_letter", mock_cover),
        patch.object(InterviewPrepAgent, "generate_interview_pack", mock_prep),
    ):
        res = await async_client.post(
            "/v1/graphs/prepare-application",
            headers={"X-Service-Key": service_key},
            json={
                "profile": profile.model_dump(),
                "job": job.model_dump(),
                "company_name": "UnreachableCorp",
            },
        )
        assert res.status_code == 202
        run_id = res.json()["run_id"]

        for _ in range(100):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["status"] in ("completed", "failed", "stopped"):
                break

        print("DEBUG SNAP:", json.dumps(snap, indent=2))
        assert snap["status"] == "completed"
        final_res = snap["state"]["final_result"]
        # Must continue and flag company research
        assert final_res["company_research_flagged"] is True
        assert final_res["document_generated"] is True
        assert final_res["tailored_resume"] is not None
        assert final_res["cover_letter"] is not None
        assert final_res["interview_pack"] is not None


@pytest.mark.asyncio
async def test_prepare_application_company_research_low_confidence_flagged(
    async_client: AsyncClient,
    service_key: str,
) -> None:
    profile = make_test_profile()
    job = make_test_job()

    # Low confidence research (0.30 < 0.60 threshold)
    mock_research = AsyncMock(return_value=make_test_company_insight(confidence=0.30))
    mock_tailor = AsyncMock(return_value=make_test_tailored_resume(passed_fabrication=True))
    mock_cover = AsyncMock(return_value=make_test_cover_letter())
    mock_prep = AsyncMock(return_value=make_test_interview_pack())

    with (
        patch.object(CompanyResearchAgent, "research", mock_research),
        patch.object(ResumeTailorAgent, "tailor_resume", mock_tailor),
        patch.object(CoverLetterAgent, "generate_cover_letter", mock_cover),
        patch.object(InterviewPrepAgent, "generate_interview_pack", mock_prep),
    ):
        res = await async_client.post(
            "/v1/graphs/prepare-application",
            headers={"X-Service-Key": service_key},
            json={
                "profile": profile.model_dump(),
                "job": job.model_dump(),
            },
        )
        assert res.status_code == 202
        run_id = res.json()["run_id"]

        for _ in range(100):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["status"] in ("completed", "failed", "stopped"):
                break

        print("DEBUG SNAP:", json.dumps(snap, indent=2))
        assert snap["status"] == "completed"
        final_res = snap["state"]["final_result"]
        assert final_res["company_research_flagged"] is True
        assert final_res["document_generated"] is True


@pytest.mark.asyncio
async def test_prepare_application_fabrication_failure_stops_branch(
    async_client: AsyncClient,
    service_key: str,
) -> None:
    profile = make_test_profile()
    job = make_test_job()

    mock_research = AsyncMock(return_value=make_test_company_insight(confidence=0.88))
    # Tailoring fails fabrication check twice
    mock_tailor = AsyncMock(return_value=make_test_tailored_resume(passed_fabrication=False))
    mock_cover = AsyncMock(return_value=make_test_cover_letter())
    mock_prep = AsyncMock(return_value=make_test_interview_pack())

    with (
        patch.object(CompanyResearchAgent, "research", mock_research),
        patch.object(ResumeTailorAgent, "tailor_resume", mock_tailor),
        patch.object(CoverLetterAgent, "generate_cover_letter", mock_cover),
        patch.object(InterviewPrepAgent, "generate_interview_pack", mock_prep),
    ):
        res = await async_client.post(
            "/v1/graphs/prepare-application",
            headers={"X-Service-Key": service_key},
            json={
                "profile": profile.model_dump(),
                "job": job.model_dump(),
            },
        )
        assert res.status_code == 202
        run_id = res.json()["run_id"]

        for _ in range(100):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["status"] in ("completed", "failed", "stopped"):
                break

        print("DEBUG SNAP:", json.dumps(snap, indent=2))
        assert snap["status"] == "completed"
        final_res = snap["state"]["final_result"]
        # Branch must stop: no document generated, flagged claims returned
        assert final_res["document_generated"] is False
        assert final_res["fabrication_failed"] is True
        assert len(final_res["flagged_claims"]) > 0
        assert final_res["flagged_claims"][0]["text"] == "Invented Quantum Computing Lead title"
        # Cover letter was skipped and never called
        mock_cover.assert_not_called()
        # Parallel interview prep completed normally
        assert final_res["interview_pack"] is not None


# ── SSE Event Order Tests ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sse_event_order(
    async_client: AsyncClient,
    service_key: str,
) -> None:
    profile = make_test_profile()
    job = make_test_job()

    mock_research = AsyncMock(return_value=make_test_company_insight(confidence=0.90))
    mock_tailor = AsyncMock(return_value=make_test_tailored_resume(passed_fabrication=True))
    mock_cover = AsyncMock(return_value=make_test_cover_letter())
    mock_prep = AsyncMock(return_value=make_test_interview_pack())

    with (
        patch.object(CompanyResearchAgent, "research", mock_research),
        patch.object(ResumeTailorAgent, "tailor_resume", mock_tailor),
        patch.object(CoverLetterAgent, "generate_cover_letter", mock_cover),
        patch.object(InterviewPrepAgent, "generate_interview_pack", mock_prep),
    ):
        res = await async_client.post(
            "/v1/graphs/prepare-application",
            headers={"X-Service-Key": service_key},
            json={
                "profile": profile.model_dump(),
                "job": job.model_dump(),
            },
        )
        assert res.status_code == 202
        run_id = res.json()["run_id"]

        for _ in range(100):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["status"] in ("completed", "failed", "stopped"):
                break

        # Read event stream
        sse_res = await async_client.get(
            f"/v1/graphs/{run_id}/events",
            headers={"X-Service-Key": service_key},
        )
        assert sse_res.status_code == 200

        lines = [line.strip() for line in sse_res.text.split("\n") if line.startswith("data: ")]
        events = [json.loads(line.replace("data: ", "")) for line in lines]

        # Verify event sequence
        assert len(events) >= 5
        assert events[0]["node"] == "system"
        assert events[0]["status"] == "queued"

        # Check node order: for each node, 'running' must occur before 'done'
        seen_running: set[str] = set()
        for ev in events:
            node = ev["node"]
            status = ev["status"]
            if status == "running":
                seen_running.add(node)
                assert ev["started_at"] is not None
            elif status == "done":
                if node != "system":
                    assert node in seen_running, f"Node '{node}' emitted done before running!"
                assert ev["ended_at"] is not None

        # Final event is system done
        assert events[-1]["node"] == "system"
        assert events[-1]["status"] == "done"


# ── Checkpointing, Kill, and Resume Tests ────────────────────────────────────────


@pytest.mark.asyncio
async def test_resume_after_failed_node(
    async_client: AsyncClient,
    service_key: str,
) -> None:
    profile = make_test_profile()
    job = make_test_job()

    mock_research = AsyncMock(return_value=make_test_company_insight())
    mock_tailor = AsyncMock(return_value=make_test_tailored_resume(passed_fabrication=True))
    mock_cover = AsyncMock(return_value=make_test_cover_letter())

    # Interview prep fails with FatalNodeError on first attempt
    first_attempt = True

    async def flaky_interview_prep(*args, **kwargs):
        nonlocal first_attempt
        if first_attempt:
            first_attempt = False
            raise FatalNodeError("Temporary transient API network drop")
        return make_test_interview_pack()

    with (
        patch.object(CompanyResearchAgent, "research", mock_research),
        patch.object(ResumeTailorAgent, "tailor_resume", mock_tailor),
        patch.object(CoverLetterAgent, "generate_cover_letter", mock_cover),
        patch(
            "app.graphs.prepare_application.InterviewPrepAgent.generate_interview_pack",
            side_effect=flaky_interview_prep,
        ),
    ):
        res = await async_client.post(
            "/v1/graphs/prepare-application",
            headers={"X-Service-Key": service_key},
            json={
                "profile": profile.model_dump(),
                "job": job.model_dump(),
            },
        )
        assert res.status_code == 202
        run_id = res.json()["run_id"]

        # Wait for failure
        for _ in range(50):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["status"] == "failed":
                break

        assert snap["status"] == "failed"
        # Completed nodes before failure are checkpointed
        assert snap["node_status"]["load_inputs"] == "done"
        assert snap["node_status"]["company_research"] == "done"
        assert snap["node_status"]["interview_prep"] == "failed"

        # Now resume the run
        resume_res = await async_client.post(
            f"/v1/graphs/{run_id}/resume",
            headers={"X-Service-Key": service_key},
        )
        assert resume_res.status_code == 200

        # Wait for resumed run to complete
        for _ in range(100):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["status"] in ("completed", "failed", "stopped"):
                break

        print("DEBUG SNAP:", json.dumps(snap, indent=2))
        assert snap["status"] == "completed"
        assert snap["node_status"]["interview_prep"] == "done"
        assert snap["node_status"]["assemble_result"] == "done"
        assert snap["state"]["completed"] is True


@pytest.mark.asyncio
async def test_kill_and_resume_flow(
    async_client: AsyncClient,
    service_key: str,
) -> None:
    profile = make_test_profile()
    job = make_test_job()

    async def slow_research(*args, **kwargs):
        # Pause until signaled or cancelled
        await asyncio.sleep(2.0)
        return make_test_company_insight()

    mock_tailor = AsyncMock(return_value=make_test_tailored_resume(passed_fabrication=True))
    mock_cover = AsyncMock(return_value=make_test_cover_letter())
    mock_prep = AsyncMock(return_value=make_test_interview_pack())

    with (
        patch.object(CompanyResearchAgent, "research", side_effect=slow_research),
        patch.object(ResumeTailorAgent, "tailor_resume", mock_tailor),
        patch.object(CoverLetterAgent, "generate_cover_letter", mock_cover),
        patch.object(InterviewPrepAgent, "generate_interview_pack", mock_prep),
    ):
        res = await async_client.post(
            "/v1/graphs/prepare-application",
            headers={"X-Service-Key": service_key},
            json={
                "profile": profile.model_dump(),
                "job": job.model_dump(),
            },
        )
        assert res.status_code == 202
        run_id = res.json()["run_id"]

        # Wait until company_research is running
        for _ in range(20):
            await asyncio.sleep(0.05)
            snap = (
                await async_client.get(
                    f"/v1/graphs/{run_id}",
                    headers={"X-Service-Key": service_key},
                )
            ).json()
            if snap["node_status"].get("company_research") == "running":
                break

        # Kill the run
        kill_res = await async_client.post(
            f"/v1/graphs/{run_id}/kill",
            headers={"X-Service-Key": service_key},
        )
        assert kill_res.status_code == 200
        assert kill_res.json()["status"] == "stopped"

        snap_after_kill = (
            await async_client.get(
                f"/v1/graphs/{run_id}",
                headers={"X-Service-Key": service_key},
            )
        ).json()
        assert snap_after_kill["status"] == "stopped"

        # Now replace slow_research with normal research and resume
        with patch.object(
            CompanyResearchAgent, "research", AsyncMock(return_value=make_test_company_insight())
        ):
            resume_res = await async_client.post(
                f"/v1/graphs/{run_id}/resume",
                headers={"X-Service-Key": service_key},
            )
            assert resume_res.status_code == 200

            for _ in range(50):
                await asyncio.sleep(0.05)
                snap = (
                    await async_client.get(
                        f"/v1/graphs/{run_id}",
                        headers={"X-Service-Key": service_key},
                    )
                ).json()
                if snap["status"] == "completed":
                    break

            assert snap["status"] == "completed"
            assert snap["state"]["completed"] is True
