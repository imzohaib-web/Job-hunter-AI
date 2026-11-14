from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph

from app.graphs.checkpointer import get_checkpointer
from app.graphs.discovery import build_discovery_graph
from app.graphs.events import event_manager
from app.graphs.prepare_application import build_prepare_application_graph
from app.graphs.types import DiscoveryState, PrepareApplicationState
from app.schemas.graph import (
    DiscoveryGraphRequest,
    GraphRunSnapshot,
    GraphType,
    PrepareApplicationRequest,
    ProgressEvent,
    RunStatus,
)

logger = logging.getLogger("jobpilot.graphs.runner")


def utc_iso_now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class RunRecord:
    run_id: str
    graph_type: GraphType
    status: RunStatus
    graph: CompiledStateGraph[Any, Any]
    task: asyncio.Task[Any] | None = None
    state: Any = None
    error: str | None = None
    created_at: str = ""
    updated_at: str = ""


class GraphRunManager:
    """Production async run manager coordinating background graph executions,

    cancellations, checkpointing, and resumptions.
    """

    def __init__(self) -> None:
        self._runs: dict[str, RunRecord] = {}
        self._lock = asyncio.Lock()

    async def start_discovery(self, request: DiscoveryGraphRequest) -> str:
        """Initialize and background a new Discovery Graph run."""
        run_id = request.run_id or str(uuid.uuid4())
        checkpointer = get_checkpointer()
        graph = build_discovery_graph(checkpointer=checkpointer)

        initial_state: DiscoveryState = {
            "run_id": run_id,
            "profile": request.profile,
            "resume_bytes": request.resume_bytes,
            "resume_text": request.resume_text,
            "resume_filename": request.resume_filename,
            "query": request.query,
            "preferences": request.preferences,
            "weights": request.weights,
            "llm_rerank": request.llm_rerank,
            "jobs": [],
            "matches": [],
            "node_status": {},
            "errors": {},
            "completed": False,
            "final_result": None,
        }

        record = RunRecord(
            run_id=run_id,
            graph_type="discovery",
            status="queued",
            graph=graph,
            state=initial_state,
            created_at=utc_iso_now(),
            updated_at=utc_iso_now(),
        )

        async with self._lock:
            self._runs[run_id] = record

        # Emit initial queued event
        await event_manager.emit(
            ProgressEvent(
                run_id=run_id,
                node="system",
                status="queued",
                started_at=utc_iso_now(),
                ended_at=None,
                message="Discovery graph execution queued.",
            )
        )

        # Launch non-blocking background execution
        task = asyncio.create_task(self._execute_run(record, initial_state))
        record.task = task
        return run_id

    async def start_prepare_application(self, request: PrepareApplicationRequest) -> str:
        """Initialize and background a new Prepare Application Graph run."""
        run_id = request.run_id or str(uuid.uuid4())
        checkpointer = get_checkpointer()
        graph = build_prepare_application_graph(checkpointer=checkpointer)

        initial_state: PrepareApplicationState = {
            "run_id": run_id,
            "profile": request.profile,
            "job": request.job,
            "company_name": request.company_name,
            "company_website": request.company_website,
            "raw_context": request.raw_context,
            "company_insight": None,
            "company_research_flagged": False,
            "tailored_resume": None,
            "fabrication_failed_twice": False,
            "flagged_claims": [],
            "interview_pack": None,
            "cover_letter": None,
            "node_status": {},
            "errors": {},
            "completed": False,
            "final_result": None,
        }

        record = RunRecord(
            run_id=run_id,
            graph_type="prepare-application",
            status="queued",
            graph=graph,
            state=initial_state,
            created_at=utc_iso_now(),
            updated_at=utc_iso_now(),
        )

        async with self._lock:
            self._runs[run_id] = record

        # Emit initial queued event
        await event_manager.emit(
            ProgressEvent(
                run_id=run_id,
                node="system",
                status="queued",
                started_at=utc_iso_now(),
                ended_at=None,
                message="Prepare-application graph execution queued.",
            )
        )

        # Launch non-blocking background execution
        task = asyncio.create_task(self._execute_run(record, initial_state))
        record.task = task
        return run_id

    async def resume_run(self, run_id: str) -> str:
        """Resume execution of a halted, failed, or killed run from its latest checkpoint."""
        async with self._lock:
            record = self._runs.get(run_id)
            if not record:
                raise KeyError(f"Run ID '{run_id}' not found.")

            if record.status == "running":
                raise ValueError(f"Run '{run_id}' is already actively executing.")

            record.status = "running"
            record.updated_at = utc_iso_now()

        await event_manager.emit(
            ProgressEvent(
                run_id=run_id,
                node="system",
                status="running",
                started_at=utc_iso_now(),
                ended_at=None,
                message="Resuming graph execution from latest checkpoint without redoing nodes.",
            )
        )

        # Resuming with None tells LangGraph to continue from the thread checkpoint
        task = asyncio.create_task(self._execute_run(record, None))
        record.task = task
        return run_id

    async def kill_run(self, run_id: str) -> None:
        """Terminate a running graph task immediately."""
        async with self._lock:
            record = self._runs.get(run_id)
            if not record:
                raise KeyError(f"Run ID '{run_id}' not found.")

            if record.status in ("completed", "stopped"):
                return

            record.status = "stopped"
            record.updated_at = utc_iso_now()
            task = record.task

        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

        await event_manager.emit(
            ProgressEvent(
                run_id=run_id,
                node="system",
                status="failed",
                started_at=utc_iso_now(),
                ended_at=utc_iso_now(),
                message=f"Run '{run_id}' killed by user.",
            )
        )

    async def get_snapshot(self, run_id: str) -> GraphRunSnapshot:
        """Retrieve current state snapshot and event logs for run_id."""
        async with self._lock:
            record = self._runs.get(run_id)
            if not record:
                raise KeyError(f"Run ID '{run_id}' not found.")

        # Read latest state from LangGraph checkpoint state if available
        config: RunnableConfig = {"configurable": {"thread_id": run_id}}
        current_state: dict[str, Any] = {}
        try:
            snapshot = await record.graph.aget_state(config)
            if snapshot and snapshot.values:
                current_state = dict(snapshot.values)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Could not read LangGraph state snapshot: %s", exc)

        if not current_state and record.state:
            current_state = dict(record.state)

        node_status = dict(current_state.get("node_status", {}))
        errors = dict(current_state.get("errors", {}))
        events = event_manager.get_events(run_id)

        # Merge latest node statuses and errors from progress events
        for ev in events:
            if ev.node != "system":
                node_status[ev.node] = ev.status
                if ev.status == "failed" and ev.message:
                    errors[ev.node] = ev.message

        return GraphRunSnapshot(
            run_id=run_id,
            graph_type=record.graph_type,
            status=record.status,
            node_status=node_status,
            errors=errors,
            events=events,
            state=current_state,
            error=record.error,
        )

    async def _execute_run(
        self,
        record: RunRecord,
        input_data: Any,
    ) -> None:
        """Internal worker executing graph run and handling terminal lifecycle states."""
        run_id = record.run_id
        config: RunnableConfig = {"configurable": {"thread_id": run_id}}
        record.status = "running"
        record.updated_at = utc_iso_now()

        try:
            # ainvoke with input_data (if first run) or None (if resuming)
            final_state = await record.graph.ainvoke(input_data, config=config)
            record.state = final_state
            record.status = "completed"
            record.updated_at = utc_iso_now()

            await event_manager.emit(
                ProgressEvent(
                    run_id=run_id,
                    node="system",
                    status="done",
                    started_at=utc_iso_now(),
                    ended_at=utc_iso_now(),
                    message=f"Graph '{record.graph_type}' execution completed successfully.",
                )
            )

        except asyncio.CancelledError:
            record.status = "stopped"
            record.updated_at = utc_iso_now()
            logger.info("Graph run '%s' was cancelled.", run_id)

        except Exception as exc:  # noqa: BLE001
            record.status = "failed"
            record.error = str(exc)
            record.updated_at = utc_iso_now()
            logger.error("Graph run '%s' failed: %s", run_id, exc, exc_info=True)

            await event_manager.emit(
                ProgressEvent(
                    run_id=run_id,
                    node="system",
                    status="failed",
                    started_at=utc_iso_now(),
                    ended_at=utc_iso_now(),
                    message=f"Graph execution failed: {exc}",
                )
            )

        finally:
            # End of stream signal for SSE listeners
            await event_manager.complete_stream(run_id)

    def clear(self) -> None:
        """Clear all active run records (for test isolation)."""
        self._runs.clear()


# Global singleton run manager
run_manager = GraphRunManager()
