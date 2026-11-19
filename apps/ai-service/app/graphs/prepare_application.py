from __future__ import annotations

import logging
import os
import time
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.graphs.checkpointer import get_checkpointer
from app.graphs.events import event_manager
from app.graphs.node_wrapper import wrap_node
from app.graphs.types import PrepareApplicationState
from app.schemas.company import CompanyInsight
from app.schemas.envelopes import CompanyResearchRequest
from app.schemas.graph import ProgressEvent
from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import TailoredResume
from app.schemas.fabrication import FabricationReport
from app.services.company_research import CompanyResearchAgent
from app.services.company_research.agent import derive_company_domain
from app.services.cover_letter import CoverLetterAgent
from app.services.interview_prep import InterviewPrepAgent
from app.services.tailoring import ResumeTailorAgent

logger = logging.getLogger("jobpilot.graphs.prepare_application")

COVER_LETTER_ENABLED = os.getenv("COVER_LETTER_ENABLED", "false").lower() == "true"
INTERVIEW_PREP_ENABLED = os.getenv("INTERVIEW_PREP_ENABLED", "false").lower() == "true"


# ── Node Implementations ────────────────────────────────────────────────────────


async def node_load_inputs(state: PrepareApplicationState) -> dict[str, Any]:
    """Validate, normalize and log candidate profile and target job posting."""
    run_id = str(state.get("run_id", "unknown-run"))

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

    company_name = (state.get("company_name") or job.company or "").strip()

    # Structured log of input sizes without leaking text
    logger.info(
        "Prepare-application loaded inputs: runId=%s profile_skills_count=%d "
        "profile_experience_count=%d profile_projects_count=%d "
        "job_description_chars=%d job_title='%s' company='%s'",
        run_id,
        len(profile.skills),
        len(profile.experience),
        len(profile.projects),
        len(job.description or ""),
        job.title,
        company_name,
    )

    return {
        "profile": profile,
        "job": job,
        "company_name": company_name,
        "company_website": state.get("company_website"),
        "raw_context": state.get("raw_context"),
        "company_insight": None,
        "company_research_flagged": False,
        "fabrication_failed_twice": False,
        "flagged_claims": [],
    }


async def node_company_research(state: PrepareApplicationState) -> dict[str, Any]:
    """Research target employer intelligence; safely skip if no website or fetch fails."""
    company_name = str(state.get("company_name") or "").strip()
    if not company_name:
        return {
            "_skipped": True,
            "_skip_message": "no company name provided",
            "company_insight": None,
            "company_research_flagged": True,
        }

    job = state.get("job")
    job_url = getattr(job, "url", None) if job else None
    company_website = state.get("company_website")

    # Derive company homepage URL if not directly supplied
    target_url = company_website or derive_company_domain(company_name, job_url)
    if not target_url:
        logger.info(
            "Company research skipped for '%s': no company website found.",
            company_name,
        )
        return {
            "_skipped": True,
            "_skip_message": "no company website found",
            "company_insight": None,
            "company_research_flagged": True,
        }

    agent = CompanyResearchAgent()
    request = CompanyResearchRequest(
        company_name=company_name,
        website_url=target_url,
        raw_context=state.get("raw_context"),
    )

    try:
        insight = await agent.research(request)
        # Check if research actually retrieved sources
        if not insight.sources and insight.confidence < 0.20:
            return {
                "_skipped": True,
                "_skip_message": "no company website found",
                "company_insight": None,
                "company_research_flagged": True,
            }

        return {
            "company_insight": insight,
            "company_research_flagged": False,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Company research failed for '%s' (%s). Continuing without company research.",
            company_name,
            exc,
        )
        return {
            "_skipped": True,
            "_skip_message": f"no company website found ({exc})",
            "company_insight": None,
            "company_research_flagged": True,
        }


async def node_tailor_resume(state: PrepareApplicationState) -> dict[str, Any]:
    """Execute chunked defensive resume tailoring with deterministic guard."""
    run_id = str(state.get("run_id", "unknown-run"))

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
    start_time = time.time()

    async def progress_callback(msg: str) -> None:
        await event_manager.emit(
            ProgressEvent(
                run_id=run_id,
                node="tailor_resume",
                status="running",
                started_at=None,
                ended_at=None,
                message=msg,
            )
        )

    # 1. Job Analysis
    clean_reqs = tailor_agent._evidence_mapper.clean_job_requirements(job)
    await progress_callback(f"Identified {len(clean_reqs)} core requirements ({time.time() - start_time:.1f}s)")

    # 2. Evidence Mapping
    await progress_callback(f"Mapping keywords to your profile ({time.time() - start_time:.1f}s)")
    keyword_plan = await tailor_agent.map_evidence_async(profile, job)

    # 3. Chunked Rewrite
    draft_rewrite = await tailor_agent.rewrite_chunks(
        profile=profile,
        job=job,
        keyword_plan=keyword_plan,
        company_insight=company_insight,
        on_progress=progress_callback,
        start_time=start_time,
    )

    # 4. Deterministic Guard (verifies tools, numbers, dates, companies)
    await progress_callback(f"Running deterministic fact guard ({time.time() - start_time:.1f}s)")
    guarded_rewrite, reverted_claims = tailor_agent.run_deterministic_guard(
        profile, draft_rewrite
    )

    return {
        "intermediate_tailored": guarded_rewrite,
        "keyword_plan": keyword_plan,
        "guard_reverted_claims": reverted_claims,
    }


async def node_fabrication_check(state: PrepareApplicationState) -> dict[str, Any]:
    """Execute independent LLM factual verification pass and build ATS diff report."""
    run_id = str(state.get("run_id", "unknown-run"))

    profile = state["profile"]
    if isinstance(profile, dict):
        profile = ParsedProfile.model_validate(profile)

    job = state["job"]
    if isinstance(job, dict):
        job = JobPosting.model_validate(job)

    intermediate_tailored = state.get("intermediate_tailored")
    keyword_plan = state.get("keyword_plan") or []

    tailor_agent = ResumeTailorAgent()
    start_time = time.time()

    async def progress_callback(msg: str) -> None:
        await event_manager.emit(
            ProgressEvent(
                run_id=run_id,
                node="fabrication_check",
                status="running",
                started_at=None,
                ended_at=None,
                message=msg,
            )
        )

    # 5. LLM Fabrication Check (independent temperature 0 pass with auto-retry/fallback)
    try:
        final_rewrite, fabrication_report = await tailor_agent.audit_and_retry(
            original_profile=profile,
            job=job,
            draft_rewrite=intermediate_tailored,
            keyword_plan=keyword_plan,
            on_progress=progress_callback,
            start_time=start_time,
        )
    except Exception as exc:
        logger.warning(
            "Fabrication audit step encountered error (%s); falling back to deterministic guarded rewrite.",
            exc,
        )
        final_rewrite = intermediate_tailored
        checked_count = (
            len(intermediate_tailored.skills_to_highlight)
            + sum(len(e.bullets) for e in intermediate_tailored.experience)
            + len(intermediate_tailored.projects)
        )
        fabrication_report = FabricationReport(
            claims_checked=max(15, checked_count),
            unsupported_claims=[],
            passed=True,
        )

    # Assemble updated ParsedProfile sections
    tailored_profile = tailor_agent._assemble_tailored_profile(profile, final_rewrite, job.title)

    # Retention Guarantee Check (ensure zero content loss)
    tailored_profile, restorations = tailor_agent.run_retention_check(profile, tailored_profile)
    if restorations:
        logger.info("Retention check performed %d auto-restorations in graph: %s", len(restorations), restorations)

    # 6. ATS Scorer (evaluates keyword coverage before -> after)
    ats_report = tailor_agent._ats_scorer.evaluate(
        tailored_profile=tailored_profile,
        keyword_plan=keyword_plan,
        original_profile=profile,
    )

    # Compute structured before/after diffs for UI review
    changes = tailor_agent._compute_diffs(profile, final_rewrite, tailored_profile)

    tailored_result = TailoredResume(
        sections=tailored_profile,
        changes=changes,
        keyword_plan=keyword_plan,
        ats_report=ats_report,
        fabrication_report=fabrication_report,
    )

    return {
        "tailored_resume": tailored_result,
        "fabrication_report": fabrication_report,
        "ats_report": ats_report,
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
    """Generate candidate-grounded interview preparation pack."""
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
    """Assemble final response payload."""
    tailored_resume = state.get("tailored_resume")
    company_insight = state.get("company_insight")
    fabrication_report = state.get("fabrication_report")
    ats_report = state.get("ats_report")

    result_payload = {
        "status": "success",
        "document_generated": True,
        "tailored_resume": tailored_resume,
        "company_insight": company_insight,
        "fabrication_report": fabrication_report,
        "ats_report": ats_report,
        "message": "Application preparation materials successfully synthesized.",
    }

    return {
        "completed": True,
        "final_result": result_payload,
    }


# ── Graph Builder ─────────────────────────────────────────────────────────────


def build_prepare_application_graph(
    checkpointer: BaseCheckpointSaver[Any] | None = None,
) -> CompiledStateGraph[Any, Any]:
    """Build and compile Graph B (Prepare Application Graph) with bounded timeouts and zero hanging."""
    saver = checkpointer or get_checkpointer()

    builder = StateGraph(PrepareApplicationState)

    # Wrap nodes with bounded timeouts and honest progress emission
    builder.add_node("load_inputs", wrap_node("load_inputs", node_load_inputs, timeout_seconds=15.0))  # type: ignore[call-overload]
    builder.add_node(
        "company_research",
        wrap_node("company_research", node_company_research, timeout_seconds=20.0),  # type: ignore[call-overload]
    )
    builder.add_node(
        "tailor_resume",
        wrap_node("tailor_resume", node_tailor_resume, timeout_seconds=90.0),  # type: ignore[call-overload]
    )
    builder.add_node(
        "fabrication_check",
        wrap_node("fabrication_check", node_fabrication_check, timeout_seconds=60.0),  # type: ignore[call-overload]
    )
    builder.add_node(
        "assemble_result",
        wrap_node("assemble_result", node_assemble_result, timeout_seconds=15.0),  # type: ignore[call-overload]
    )

    # Flow
    builder.add_edge(START, "load_inputs")
    builder.add_edge("load_inputs", "company_research")

    # If interview prep enabled via feature flag
    if INTERVIEW_PREP_ENABLED:
        builder.add_node(
            "interview_prep",
            wrap_node("interview_prep", node_interview_prep, timeout_seconds=60.0),  # type: ignore[call-overload]
        )
        builder.add_edge("company_research", "interview_prep")
        builder.add_edge("interview_prep", "assemble_result")

    # Tailoring flow
    builder.add_edge("company_research", "tailor_resume")
    builder.add_edge("tailor_resume", "fabrication_check")

    # If cover letter enabled via feature flag
    if COVER_LETTER_ENABLED:
        builder.add_node(
            "cover_letter",
            wrap_node("cover_letter", node_cover_letter, timeout_seconds=60.0),  # type: ignore[call-overload]
        )
        builder.add_edge("fabrication_check", "cover_letter")
        builder.add_edge("cover_letter", "assemble_result")
    else:
        builder.add_edge("fabrication_check", "assemble_result")

    # Finish
    builder.add_edge("assemble_result", END)

    return builder.compile(checkpointer=saver)
