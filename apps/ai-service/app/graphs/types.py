from __future__ import annotations

from typing import Annotated, Any, TypedDict

from app.schemas.company import CompanyInsight
from app.schemas.cover_letter import CoverLetter
from app.schemas.fabrication import UnsupportedClaim
from app.schemas.interview import InterviewPack
from app.schemas.job import JobPosting, JobQuery
from app.schemas.match import CandidatePreferences, RankedJobItem, RankingWeights
from app.schemas.profile import ParsedProfile
from app.schemas.tailoring import TailoredResume


def merge_dicts(a: dict[str, Any] | None, b: dict[str, Any] | None) -> dict[str, Any]:
    """Reducer function merging parallel dictionary updates in LangGraph."""
    res = dict(a) if a else {}
    if b:
        res.update(b)
    return res


class DiscoveryState(TypedDict, total=False):
    """Shared state for Graph A (Job Discovery Graph)."""

    run_id: str
    profile: ParsedProfile | None
    resume_bytes: str | None
    resume_text: str | None
    resume_filename: str
    query: JobQuery | dict[str, Any]
    preferences: CandidatePreferences | dict[str, Any] | None
    weights: RankingWeights | dict[str, Any] | None
    llm_rerank: bool
    jobs: list[JobPosting] | list[dict[str, Any]]
    matches: list[RankedJobItem] | list[dict[str, Any]]
    node_status: Annotated[dict[str, str], merge_dicts]
    errors: Annotated[dict[str, str], merge_dicts]
    completed: bool
    final_result: dict[str, Any] | None


class PrepareApplicationState(TypedDict, total=False):
    """Shared state for Graph B (Prepare Application Graph)."""

    run_id: str
    profile: ParsedProfile | dict[str, Any]
    job: JobPosting | dict[str, Any]
    company_name: str | None
    company_website: str | None
    raw_context: str | None
    company_insight: CompanyInsight | dict[str, Any] | None
    company_research_flagged: bool
    tailored_resume: TailoredResume | dict[str, Any] | None
    fabrication_failed_twice: bool
    flagged_claims: list[UnsupportedClaim] | list[dict[str, Any]]
    interview_pack: InterviewPack | dict[str, Any] | None
    cover_letter: CoverLetter | dict[str, Any] | None
    node_status: Annotated[dict[str, str], merge_dicts]
    errors: Annotated[dict[str, str], merge_dicts]
    completed: bool
    final_result: dict[str, Any] | None
