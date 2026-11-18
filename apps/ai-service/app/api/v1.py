from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status

from app.agents.resume_parser import parse_resume_content
from app.schemas.envelopes import (
    ApiMeta,
    BatchMatchRequest,
    BatchMatchResponse,
    CheckFabricationRequest,
    CheckFabricationResponse,
    CompanyResearchRequest,
    CompanyResearchResponse,
    DiscoverJobsData,
    DiscoverJobsRequest,
    DiscoverJobsResponse,
    ExportResumeDocxRequest,
    MatchJobRequest,
    MatchJobResponse,
    ParseResumeResponse,
    RankResponse,
    SearchJobsResponse,
    TailorResumeRequest,
    TailorResumeResponse,
)
from app.schemas.job import JobQuery
from app.schemas.match import JobWithEmbedding, RankRequest
from app.services.company_research import CompanyResearchAgent, SSRFSecurityError
from app.services.discovery_pipeline import run_discovery
from app.services.job_sources import JobSourceAggregator
from app.services.ranking import HybridRankingAgent
from app.services.tailoring import (
    FabricationChecker,
    ResumeTailorAgent,
    build_docx_resume,
)
from app.services.tailoring.schemas import ResumeRewriteLLMOutput

router = APIRouter(tags=["AI Operations"])
logger = logging.getLogger("jobpilot.api.v1")


@router.post(
    "/v1/parse-resume",
    response_model=ParseResumeResponse,
    summary="Parse candidate resume PDF or DOCX into structured profile",
)
@router.post(
    "/api/v1/parse-resume",
    response_model=ParseResumeResponse,
    summary="Parse candidate resume PDF or DOCX into structured profile",
)
@router.post(
    "/api/v1/resume/parse",
    response_model=ParseResumeResponse,
    summary="Parse candidate resume PDF or DOCX into structured profile",
)
async def parse_resume(
    file: UploadFile = File(..., description="Resume file in PDF or DOCX format (<= 5 MB)"),
) -> ParseResumeResponse:
    start_time = time.perf_counter()
    content = await file.read()
    filename = file.filename or "resume.pdf"

    try:
        result = await parse_resume_content(file_bytes=content, filename=filename)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "PARSER_FAILED",
                "message": str(val_err),
            },
        ) from val_err

    duration_ms = (time.perf_counter() - start_time) * 1000

    return ParseResumeResponse(
        data=result.profile,
        warnings=result.warnings,
        meta=ApiMeta(duration_ms=duration_ms),
    )


@router.post(
    "/v1/search-jobs",
    response_model=SearchJobsResponse,
    summary="Search, aggregate, and deduplicate job opportunities across enabled public adapters",
)
@router.post(
    "/api/v1/jobs/search",
    response_model=SearchJobsResponse,
    summary="Search, aggregate, and deduplicate job opportunities across enabled public adapters",
)
@router.post(
    "/api/v1/search-jobs",
    response_model=SearchJobsResponse,
    summary="Search, aggregate, and deduplicate job opportunities across enabled public adapters",
)
async def search_jobs(payload: JobQuery) -> SearchJobsResponse:
    start_time = time.perf_counter()
    aggregator = JobSourceAggregator()
    result = await aggregator.aggregate(payload)
    duration_ms = (time.perf_counter() - start_time) * 1000

    warnings: list[str] = []
    for s in result.source_statuses:
        if s.status == "error":
            warnings.append(f"Source '{s.source}' failed: {s.error}")
        elif s.status == "skipped" and s.error:
            warnings.append(f"Source '{s.source}' skipped: {s.error}")

    return SearchJobsResponse(
        data=result,
        warnings=warnings,
        meta=ApiMeta(duration_ms=duration_ms),
    )


@router.get(
    "/v1/sources",
    summary="List available job sources, credentials status, and supported filters",
)
@router.get(
    "/api/v1/jobs/sources",
    summary="List available job sources, credentials status, and supported filters",
)
async def get_job_sources() -> dict[str, Any]:
    aggregator = JobSourceAggregator()
    return {"sources": aggregator.get_source_statuses()}


@router.post(
    "/v1/discover",
    response_model=DiscoverJobsResponse,
    summary="Unified job discovery, deduplication, filtering, and hybrid ranking in a single pass",
)
@router.post(
    "/api/v1/jobs/discover",
    response_model=DiscoverJobsResponse,
    summary="Unified job discovery, deduplication, filtering, and hybrid ranking in a single pass",
)
async def discover_jobs(payload: DiscoverJobsRequest) -> DiscoverJobsResponse:
    start_time = time.perf_counter()
    try:
        result = await run_discovery(
            profile=payload.profile,
            preferences=payload.preferences,
            query=payload.query,
            sources=payload.sources,
            llm_rerank=payload.llm_rerank,
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        warnings: list[str] = []
        for st in result.get("source_statuses", []):
            st_val = getattr(st, "status", None)
            st_name = getattr(st, "source", "")
            st_err = getattr(st, "error", "")
            if st_val in ("error", "failed"):
                warnings.append(f"Source '{st_name}' error: {st_err}")
            elif st_val == "skipped" and st_err:
                warnings.append(f"Source '{st_name}' skipped: {st_err}")

        data = DiscoverJobsData(
            ranked_jobs=result["ranked_jobs"],
            total=result["total"],
            unfiltered_count=result["unfiltered_count"],
            hard_filtered_count=result["hard_filtered_count"],
            source_statuses=result["source_statuses"],
            diagnostics=result["diagnostics"],
            tier_counts=result["tier_counts"],
            timings=result["timings"],
            fallback_used=result["fallback_used"],
            fallback_stage=result["fallback_stage"],
        )

        return DiscoverJobsResponse(
            data=data,
            warnings=warnings,
            meta=ApiMeta(duration_ms=duration_ms),
        )
    except Exception as exc:
        logger.exception("Unified job discovery failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "DISCOVERY_FAILED",
                "message": str(exc),
                "details": {"error_type": type(exc).__name__},
            },
        ) from exc


@router.post(
    "/v1/rank",
    response_model=RankResponse,
    summary="Hybrid multi-stage ranking of job opportunities against candidate profile",
)
@router.post(
    "/api/v1/jobs/rank",
    response_model=RankResponse,
    summary="Hybrid multi-stage ranking of job opportunities against candidate profile",
)
async def rank_jobs(payload: RankRequest) -> RankResponse:
    start_time = time.perf_counter()
    agent = HybridRankingAgent()
    result = await agent.rank_jobs(
        profile=payload.profile,
        jobs=payload.jobs,
        preferences=payload.preferences,
        weights=payload.weights,
        llm_rerank=payload.llm_rerank,
    )
    duration_ms = (time.perf_counter() - start_time) * 1000

    warnings: list[str] = []
    if result.hard_filtered_count > 0:
        warnings.append(
            f"{result.hard_filtered_count} of {result.total} jobs failed hard criteria."
        )

    return RankResponse(
        data=result,
        warnings=warnings,
        meta=ApiMeta(duration_ms=duration_ms),
    )


@router.post(
    "/api/v1/jobs/match",
    response_model=MatchJobResponse,
    summary="Evaluate qualification match between candidate and job posting",
)
async def match_job(payload: MatchJobRequest) -> MatchJobResponse:
    start_time = time.perf_counter()
    agent = HybridRankingAgent()
    jobs_with_emb = [JobWithEmbedding(job=payload.job)]
    result = await agent.rank_jobs(
        profile=payload.profile,
        jobs=jobs_with_emb,
        llm_rerank=False,
    )
    duration_ms = (time.perf_counter() - start_time) * 1000
    if not result.ranked_jobs:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to evaluate match for job",
        )

    return MatchJobResponse(
        data=result.ranked_jobs[0].match,
        meta=ApiMeta(duration_ms=duration_ms),
    )


@router.post(
    "/api/v1/jobs/batch-match",
    response_model=BatchMatchResponse,
    summary="Score and rank candidate qualification across multiple jobs",
)
async def batch_match_jobs(payload: BatchMatchRequest) -> BatchMatchResponse:
    start_time = time.perf_counter()
    agent = HybridRankingAgent()
    jobs_with_emb = [JobWithEmbedding(job=job) for job in payload.jobs]
    result = await agent.rank_jobs(
        profile=payload.profile,
        jobs=jobs_with_emb,
        llm_rerank=False,
    )
    duration_ms = (time.perf_counter() - start_time) * 1000

    return BatchMatchResponse(
        data=[item.match for item in result.ranked_jobs],
        meta=ApiMeta(duration_ms=duration_ms),
    )


@router.post(
    "/v1/company-research",
    response_model=CompanyResearchResponse,
    summary="Synthesize company intelligence, tech stack, and culture from public web and search",
)
@router.post(
    "/api/v1/company/research",
    response_model=CompanyResearchResponse,
    summary="Synthesize company intelligence, tech stack, and culture from public web and search",
)
async def research_company(payload: CompanyResearchRequest) -> CompanyResearchResponse:
    start_time = time.perf_counter()
    agent = CompanyResearchAgent()
    try:
        insight = await agent.research(payload)
    except SSRFSecurityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SSRF_BLOCKED", "message": str(exc)},
        ) from exc
    except Exception as exc:
        logger.exception("Company research failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "RESEARCH_FAILED",
                "message": f"Failed to complete company research: {exc}",
            },
        ) from exc

    duration_ms = (time.perf_counter() - start_time) * 1000
    warnings: list[str] = list(insight.limitations)
    return CompanyResearchResponse(
        data=insight,
        warnings=warnings,
        meta=ApiMeta(duration_ms=duration_ms),
    )


@router.post(
    "/v1/tailor-resume",
    response_model=TailorResumeResponse,
    summary="Defensively tailor candidate resume specifically for target job posting",
)
@router.post(
    "/api/v1/resume/tailor",
    response_model=TailorResumeResponse,
    summary="Defensively tailor candidate resume specifically for target job posting",
)
async def tailor_resume(payload: TailorResumeRequest) -> TailorResumeResponse:
    start_time = time.perf_counter()
    agent = ResumeTailorAgent()
    tailored = await agent.tailor_resume(
        profile=payload.profile,
        job=payload.job,
        company_insight=payload.company_insight,
    )
    duration_ms = (time.perf_counter() - start_time) * 1000

    return TailorResumeResponse(
        data=tailored,
        meta=ApiMeta(duration_ms=duration_ms),
    )


@router.post(
    "/v1/check-fabrication",
    response_model=CheckFabricationResponse,
    summary="Audit tailored resume against candidate profile",
)
@router.post(
    "/api/v1/resume/check-fabrication",
    response_model=CheckFabricationResponse,
    summary="Audit tailored resume against candidate profile",
)
async def check_fabrication(payload: CheckFabricationRequest) -> CheckFabricationResponse:
    start_time = time.perf_counter()
    checker = FabricationChecker()
    mock_tailored = ResumeRewriteLLMOutput(
        tailored_summary=payload.tailored_text,
        summary_source_fact_ref="provided_text",
        summary_reason="Direct text verification",
        experience=[],
        projects=[],
        skills_to_highlight=[],
    )
    report = await checker.audit_tailored_resume(payload.original_profile, mock_tailored)
    duration_ms = (time.perf_counter() - start_time) * 1000

    return CheckFabricationResponse(
        data=report,
        meta=ApiMeta(duration_ms=duration_ms),
    )


@router.post(
    "/v1/export-resume-docx",
    summary="Export verified resume into single-column ATS-friendly DOCX",
)
@router.post(
    "/api/v1/resume/export-docx",
    summary="Export verified resume into single-column ATS-friendly DOCX",
)
async def export_resume_docx(payload: ExportResumeDocxRequest) -> Response:
    docx_stream = build_docx_resume(payload.resume, payload.target_job_title)
    name_slug = payload.resume.name.replace(" ", "_") if payload.resume.name else "Resume"
    filename = f"{name_slug}_ATS_Resume.docx"
    return Response(
        content=docx_stream.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
