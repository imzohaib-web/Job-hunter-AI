from __future__ import annotations

import base64
import logging
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agents.resume_parser import parse_resume_content
from app.graphs.checkpointer import get_checkpointer
from app.graphs.node_wrapper import wrap_node
from app.graphs.types import DiscoveryState
from app.schemas.job import JobPosting, JobQuery
from app.schemas.match import CandidatePreferences, JobWithEmbedding, RankingWeights
from app.schemas.profile import ParsedProfile
from app.services.job_sources import JobSourceAggregator
from app.services.ranking import HybridRankingAgent

logger = logging.getLogger("jobpilot.graphs.discovery")


# ── Node Implementations ────────────────────────────────────────────────────────


async def node_parse_profile(state: DiscoveryState) -> dict[str, Any]:
    """Parse resume if not already provided; otherwise skip."""
    # 1. Skip if verified profile is already present
    existing_profile = state.get("profile")
    if existing_profile is not None:
        if isinstance(existing_profile, dict):
            parsed_prof = ParsedProfile.model_validate(existing_profile)
        else:
            parsed_prof = existing_profile
        return {
            "profile": parsed_prof,
            "_skipped": True,
            "_skip_message": "Verified profile provided; resume parsing skipped.",
        }

    # 2. Extract resume bytes from text or base64
    resume_bytes_b64 = state.get("resume_bytes")
    resume_text = state.get("resume_text")
    filename = state.get("resume_filename", "resume.pdf")

    if resume_bytes_b64:
        content_bytes = base64.b64decode(resume_bytes_b64)
    elif resume_text:
        content_bytes = resume_text.encode("utf-8")
        if not filename.endswith(".txt"):
            filename = "resume.txt"
    else:
        raise ValueError("Neither a verified profile nor resume data (bytes or text) was provided.")

    # 3. Parse resume
    result = await parse_resume_content(file_bytes=content_bytes, filename=filename)
    return {"profile": result.profile}


async def node_search_jobs(state: DiscoveryState) -> dict[str, Any]:
    """Aggregate matching jobs across configured job boards."""
    raw_query = state.get("query")
    if isinstance(raw_query, dict):
        query = JobQuery.model_validate(raw_query)
    elif isinstance(raw_query, JobQuery):
        query = raw_query
    else:
        query = JobQuery(keywords="AI Engineer", location="Remote")

    aggregator = JobSourceAggregator()
    result = await aggregator.aggregate(query)
    return {"jobs": result.jobs}


async def node_rank_jobs(state: DiscoveryState) -> dict[str, Any]:
    """Rank candidate opportunities using hybrid multi-stage scoring."""
    raw_profile = state.get("profile")
    if isinstance(raw_profile, dict):
        profile = ParsedProfile.model_validate(raw_profile)
    elif isinstance(raw_profile, ParsedProfile):
        profile = raw_profile
    else:
        raise ValueError("Candidate profile is required to rank jobs.")

    raw_jobs = state.get("jobs", [])
    jobs: list[JobPosting] = []
    for j in raw_jobs:
        if isinstance(j, dict):
            jobs.append(JobPosting.model_validate(j))
        elif isinstance(j, JobPosting):
            jobs.append(j)

    if not jobs:
        logger.info("No jobs to rank; returning empty matches list.")
        return {"matches": []}

    raw_prefs = state.get("preferences")
    preferences = (
        CandidatePreferences.model_validate(raw_prefs) if isinstance(raw_prefs, dict) else raw_prefs
    )

    raw_weights = state.get("weights")
    weights = (
        RankingWeights.model_validate(raw_weights) if isinstance(raw_weights, dict) else raw_weights
    )

    llm_rerank = bool(state.get("llm_rerank", False))

    ranking_agent = HybridRankingAgent()
    jobs_input = [
        j if isinstance(j, JobWithEmbedding) else JobWithEmbedding(job=j, embedding=None)
        for j in jobs
    ]
    rank_res = await ranking_agent.rank_jobs(
        profile=profile,
        jobs=jobs_input,
        preferences=preferences,
        weights=weights,
        llm_rerank=llm_rerank,
    )
    matches = (
        rank_res.ranked_jobs
        if hasattr(rank_res, "ranked_jobs")
        else getattr(rank_res, "matches", [])
    )
    return {"matches": matches}


async def node_assemble_discovery(state: DiscoveryState) -> dict[str, Any]:
    """Consolidate discovery outputs and seal completion state."""
    return {
        "completed": True,
        "final_result": {
            "profile": state.get("profile"),
            "jobs_count": len(state.get("jobs", [])),
            "matches_count": len(state.get("matches", [])),
            "top_matches": state.get("matches", [])[:5],
        },
    }


# ── Graph Builder ─────────────────────────────────────────────────────────────


def build_discovery_graph(
    checkpointer: BaseCheckpointSaver[Any] | None = None,
) -> CompiledStateGraph[Any, Any]:
    """Build and compile Graph A (Discovery Graph) with checkpointing and error isolation."""
    saver = checkpointer or get_checkpointer()

    builder = StateGraph(DiscoveryState)

    # Wrap nodes with error isolation, timeouts, and SSE progress emission
    builder.add_node("parse_profile", wrap_node("parse_profile", node_parse_profile))  # type: ignore[call-overload]
    builder.add_node("search_jobs", wrap_node("search_jobs", node_search_jobs))  # type: ignore[call-overload]
    builder.add_node("rank_jobs", wrap_node("rank_jobs", node_rank_jobs))  # type: ignore[call-overload]
    builder.add_node(
        "assemble_discovery",
        wrap_node("assemble_discovery", node_assemble_discovery),  # type: ignore[call-overload]
    )

    # Edges
    builder.add_edge(START, "parse_profile")
    builder.add_edge("parse_profile", "search_jobs")
    builder.add_edge("search_jobs", "rank_jobs")
    builder.add_edge("rank_jobs", "assemble_discovery")
    builder.add_edge("assemble_discovery", END)

    return builder.compile(checkpointer=saver)
