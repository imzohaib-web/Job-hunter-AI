from __future__ import annotations

import logging
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.graphs.checkpointer import get_checkpointer
from app.graphs.node_wrapper import wrap_node
from app.graphs.types import PrepareApplicationState
from app.schemas.company import CompanyInsight
from app.schemas.envelopes import CompanyResearchRequest
from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import TailoredResume
from app.services.company_research import CompanyResearchAgent
from app.services.cover_letter import CoverLetterAgent
from app.services.interview_prep import InterviewPrepAgent
from app.services.tailoring import ResumeTailorAgent

logger = logging.getLogger("jobpilot.graphs.prepare_application")

LOW_CONFIDENCE_THRESHOLD = 0.60


# ── Node Implementations ────────────────────────────────────────────────────────


async def node_load_inputs(state: PrepareApplicationState) -> dict[str, Any]:
    """Validate and normalize candidate profile, job posting, and target company metadata."""
    raw_profile = state.get("profile")
    if isinstance(raw_profile, dict):
        profile = ParsedProfile.model_validate(raw_profile)
    elif isinstance(raw_profile, ParsedProfile):
        profile = raw_profile
    else:
        raise ValueError("Valid candidate profile is required for prepare-application run.")

    raw_job = state.get("job")
    if isinstance(raw_job, dict):
        job = JobPosting.model_validate(raw_job)
    elif isinstance(raw_job, JobPosting):
        job = raw_job
    else:
        raise ValueError("Valid target job posting is required for prepare-application run.")

    company_name = state.get("company_name") or job.company

    return {
        "profile": profile,
        "job": job,
        "company_name": company_name,
        "company_website": state.get("company_website"),
        "raw_context": state.get("raw_context"),
        "company_research_flagged": False,
        "fabrication_failed_twice": False,
        "flagged_claims": [],
    }


async def node_company_research(state: PrepareApplicationState) -> dict[str, Any]:
    """Research target employer intelligence; flag and continue if failure/low confidence."""
    company_name = str(state.get("company_name") or "").strip()
    if not company_name:
        logger.warning("No company name provided; continuing without company research.")
        return {
            "company_insight": None,
            "company_research_flagged": True,
        }

    agent = CompanyResearchAgent()
    request = CompanyResearchRequest(
        company_name=company_name,
        website_url=state.get("company_website"),
        raw_context=state.get("raw_context"),
    )

    try:
        insight = await agent.research(request)
        is_low_confidence = insight.confidence < LOW_CONFIDENCE_THRESHOLD
        if is_low_confidence:
            logger.warning(
                "Company research for '%s' returned low confidence (%.2f < %.2f). Flagging.",
                company_name,
                insight.confidence,
                LOW_CONFIDENCE_THRESHOLD,
            )

        return {
            "company_insight": insight,
            "company_research_flagged": is_low_confidence,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Company research failed for '%s' (%s). Continuing without company research.",
            company_name,
            exc,
        )
        return {
            "company_insight": None,
            "company_research_flagged": True,
        }


async def node_tailor_resume(state: PrepareApplicationState) -> dict[str, Any]:
    """Execute defensive resume tailoring with double fabrication audit."""
    profile = state["profile"]
    if isinstance(profile, dict):
        profile = ParsedProfile.model_validate(profile)

    job = state["job"]
    if isinstance(job, dict):
        job = JobPosting.model_validate(job)

    company_insight = state.get("company_insight")
    if isinstance(company_insight, dict):
        company_insight = CompanyInsight.model_validate(company_insight)

    tailor_agent = ResumeTailorAgent()
    tailored_result = await tailor_agent.tailor_resume(
        profile=profile,
        job=job,
        company_insight=company_insight,
    )

    # Check fabrication audit outcome
    if not tailored_result.fabrication_report.passed:
        logger.error(
            "Tailoring fabrication check failed twice with %d claims. Halting branch.",
            len(tailored_result.fabrication_report.unsupported_claims),
        )
        return {
            "tailored_resume": None,
            "fabrication_failed_twice": True,
            "flagged_claims": tailored_result.fabrication_report.unsupported_claims,
        }

    return {
        "tailored_resume": tailored_result,
        "fabrication_failed_twice": False,
        "flagged_claims": [],
    }


async def node_cover_letter(state: PrepareApplicationState) -> dict[str, Any]:
    """Generate structured cover letter utilizing approved tailoring facts."""
    profile = state["profile"]
    if isinstance(profile, dict):
        profile = ParsedProfile.model_validate(profile)

    job = state["job"]
    if isinstance(job, dict):
        job = JobPosting.model_validate(job)

    tailored_resume = state.get("tailored_resume")
    if isinstance(tailored_resume, dict):
        tailored_resume = TailoredResume.model_validate(tailored_resume)

    company_insight = state.get("company_insight")
    if isinstance(company_insight, dict):
        company_insight = CompanyInsight.model_validate(company_insight)

    cover_agent = CoverLetterAgent()
    cover_letter = await cover_agent.generate_cover_letter(
        profile=profile,
        job=job,
        tailored_resume=tailored_resume,
        company_insight=company_insight,
    )

    return {"cover_letter": cover_letter}


async def node_interview_prep(state: PrepareApplicationState) -> dict[str, Any]:
    """Generate candidate-grounded interview preparation pack in parallel."""
    profile = state["profile"]
    if isinstance(profile, dict):
        profile = ParsedProfile.model_validate(profile)

    job = state["job"]
    if isinstance(job, dict):
        job = JobPosting.model_validate(job)

    company_insight = state.get("company_insight")
    if isinstance(company_insight, dict):
        company_insight = CompanyInsight.model_validate(company_insight)

    prep_agent = InterviewPrepAgent()
    prep_pack = await prep_agent.generate_interview_pack(
        profile=profile,
        job=job,
        company_insight=company_insight,
    )

    return {"interview_pack": prep_pack}


async def node_assemble_result(state: PrepareApplicationState) -> dict[str, Any]:
    """Join parallel branches and assemble final response."""
    fab_failed = bool(state.get("fabrication_failed_twice", False))

    if fab_failed:
        # Fabrication check failed twice: return flagged claims instead of resume/letter documents
        result_payload = {
            "status": "partial_success",
            "document_generated": False,
            "fabrication_failed": True,
            "flagged_claims": state.get("flagged_claims", []),
            "interview_pack": state.get("interview_pack"),
            "company_insight": state.get("company_insight"),
            "company_research_flagged": state.get("company_research_flagged", False),
            "message": (
                "Resume tailoring stopped due to repeated fabrication check failures. "
                "Flagged claims returned."
            ),
        }
    else:
        result_payload = {
            "status": "success",
            "document_generated": True,
            "fabrication_failed": False,
            "tailored_resume": state.get("tailored_resume"),
            "cover_letter": state.get("cover_letter"),
            "interview_pack": state.get("interview_pack"),
            "company_insight": state.get("company_insight"),
            "company_research_flagged": state.get("company_research_flagged", False),
            "message": "Application preparation materials successfully synthesized.",
        }

    return {
        "completed": True,
        "final_result": result_payload,
    }


# ── Conditional Routing ─────────────────────────────────────────────────────────


def should_continue_after_company_research(state: PrepareApplicationState) -> list[str]:
    """Conditional edge after company_research: always continue to both parallel branches."""
    return ["tailor_resume", "interview_prep"]


def should_continue_after_tailoring(state: PrepareApplicationState) -> str:
    """Conditional edge after tailoring: stop branch if fabrication failed twice."""
    if state.get("fabrication_failed_twice", False):
        return "assemble_result"
    return "cover_letter"


# ── Graph Builder ─────────────────────────────────────────────────────────────


def build_prepare_application_graph(
    checkpointer: BaseCheckpointSaver[Any] | None = None,
) -> CompiledStateGraph[Any, Any]:
    """Build and compile Graph B (Prepare Application Graph) with checkpointing and fan-out."""
    saver = checkpointer or get_checkpointer()

    builder = StateGraph(PrepareApplicationState)

    # Wrap nodes with error isolation, timeouts, and SSE progress emission
    builder.add_node("load_inputs", wrap_node("load_inputs", node_load_inputs))  # type: ignore[call-overload]
    builder.add_node(
        "company_research",
        wrap_node("company_research", node_company_research),  # type: ignore[call-overload]
    )
    builder.add_node("tailor_resume", wrap_node("tailor_resume", node_tailor_resume))  # type: ignore[call-overload]
    builder.add_node("cover_letter", wrap_node("cover_letter", node_cover_letter))  # type: ignore[call-overload]
    builder.add_node("interview_prep", wrap_node("interview_prep", node_interview_prep))  # type: ignore[call-overload]
    builder.add_node(
        "assemble_result",
        wrap_node("assemble_result", node_assemble_result),  # type: ignore[call-overload]
    )

    # Flow
    builder.add_edge(START, "load_inputs")
    builder.add_edge("load_inputs", "company_research")

    # Parallel fan-out after company research (flags low confidence/failure, continues to both)
    builder.add_edge("company_research", "tailor_resume")
    builder.add_edge("company_research", "interview_prep")

    # Conditional edge after tailor_resume
    builder.add_conditional_edges(
        "tailor_resume",
        should_continue_after_tailoring,
        {"cover_letter": "cover_letter", "assemble_result": "assemble_result"},
    )

    # Tailor branch continues to cover_letter, then joins assemble_result
    builder.add_edge("cover_letter", "assemble_result")

    # Parallel interview branch joins assemble_result
    builder.add_edge("interview_prep", "assemble_result")

    # Finish
    builder.add_edge("assemble_result", END)

    return builder.compile(checkpointer=saver)
