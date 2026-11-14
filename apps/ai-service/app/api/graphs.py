from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.graphs.events import event_manager
from app.graphs.runner import run_manager
from app.schemas.graph import (
    DiscoveryGraphRequest,
    DiscoveryGraphResponse,
    GraphRunSnapshot,
    KillGraphResponse,
    PrepareApplicationRequest,
    PrepareApplicationResponse,
    ResumeGraphResponse,
)

router = APIRouter(prefix="/v1/graphs", tags=["Graph Orchestration"])
logger = logging.getLogger("jobpilot.api.graphs")


@router.post(
    "/discovery",
    response_model=DiscoveryGraphResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Schedule an asynchronous discovery graph execution",
)
async def start_discovery_graph(
    payload: DiscoveryGraphRequest,
) -> DiscoveryGraphResponse:
    """Initiate Graph A: parse_profile -> search_jobs -> rank_jobs in the background."""
    run_id = await run_manager.start_discovery(payload)
    return DiscoveryGraphResponse(
        run_id=run_id,
        graph_type="discovery",
        status="queued",
    )


@router.post(
    "/prepare-application",
    response_model=PrepareApplicationResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Schedule an asynchronous prepare-application graph execution",
)
async def start_prepare_application_graph(
    payload: PrepareApplicationRequest,
) -> PrepareApplicationResponse:
    """Initiate Graph B: load_inputs -> company_research -> parallel fan-out -> assemble."""
    run_id = await run_manager.start_prepare_application(payload)
    return PrepareApplicationResponse(
        run_id=run_id,
        graph_type="prepare-application",
        status="queued",
    )


@router.get(
    "/{run_id}",
    response_model=GraphRunSnapshot,
    summary="Fetch real-time snapshot of graph run state, node statuses, and events",
)
async def get_graph_snapshot(run_id: str) -> GraphRunSnapshot:
    """Return point-in-time snapshot of graph run state, errors, and progress events."""
    try:
        return await run_manager.get_snapshot(run_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RUN_NOT_FOUND", "message": f"Graph run '{run_id}' not found."},
        ) from None


@router.get(
    "/{run_id}/events",
    summary="Subscribe to Server-Sent Events (SSE) stream of graph progress events",
    response_class=StreamingResponse,
)
async def stream_graph_events(run_id: str) -> StreamingResponse:
    """Stream real-time Server-Sent Events for each node's status transitions."""
    # Verify run exists before opening stream
    try:
        await run_manager.get_snapshot(run_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RUN_NOT_FOUND", "message": f"Graph run '{run_id}' not found."},
        ) from None

    async def event_generator() -> AsyncGenerator[str, None]:
        async for event in event_manager.subscribe(run_id):
            yield f"data: {event.model_dump_json()}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/{run_id}/resume",
    response_model=ResumeGraphResponse,
    summary="Resume execution of a halted or failed graph from its latest checkpoint",
)
async def resume_graph(run_id: str) -> ResumeGraphResponse:
    """Resume execution of a stopped or failed run without re-executing already completed nodes."""
    try:
        await run_manager.resume_run(run_id)
        return ResumeGraphResponse(
            run_id=run_id,
            status="running",
            message="Graph execution resumed successfully from checkpoint.",
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RUN_NOT_FOUND", "message": f"Graph run '{run_id}' not found."},
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_RUNNING", "message": str(exc)},
        ) from exc


@router.post(
    "/{run_id}/kill",
    response_model=KillGraphResponse,
    summary="Terminate an active graph execution task immediately",
)
async def kill_graph(run_id: str) -> KillGraphResponse:
    """Kill an active graph run task, halting execution and preserving checkpoints for resume."""
    try:
        await run_manager.kill_run(run_id)
        return KillGraphResponse(
            run_id=run_id,
            status="stopped",
            message=f"Graph execution '{run_id}' successfully stopped.",
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RUN_NOT_FOUND", "message": f"Graph run '{run_id}' not found."},
        ) from None
