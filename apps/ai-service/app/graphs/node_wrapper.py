from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, TypeVar

from app.graphs.events import event_manager
from app.schemas.graph import ProgressEvent

logger = logging.getLogger("jobpilot.graphs.wrapper")

StateT = TypeVar("StateT")


class FatalNodeError(Exception):
    """Exception raised when a node failure must halt graph execution for manual resume."""


def utc_iso_now() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(UTC).isoformat()


def wrap_node(
    node_name: str,
    func: Callable[[StateT], Awaitable[dict[str, Any]]],
    *,
    timeout_seconds: float = 60.0,
    fatal: bool = False,
) -> Callable[[StateT], Awaitable[dict[str, Any]]]:
    """Wrap a graph node function with execution timeout, error isolation,

    and sequential ProgressEvent emission.
    """

    async def wrapped_node(state: StateT) -> dict[str, Any]:
        state_dict: dict[str, Any] = state if isinstance(state, dict) else {}
        run_id = str(state_dict.get("run_id", "unknown-run"))
        start_time = utc_iso_now()

        # 1. Emit running progress event
        await event_manager.emit(
            ProgressEvent(
                run_id=run_id,
                node=node_name,
                status="running",
                started_at=start_time,
                ended_at=None,
                message=f"Starting node '{node_name}'",
            )
        )

        try:
            # 2. Execute node with bounded timeout
            result = await asyncio.wait_for(func(state), timeout=timeout_seconds)
            end_time = utc_iso_now()

            # Handle node self-marking as skipped
            if result.get("_skipped") is True:
                skip_msg = result.get("_skip_message", f"Node '{node_name}' skipped.")
                await event_manager.emit(
                    ProgressEvent(
                        run_id=run_id,
                        node=node_name,
                        status="skipped",
                        started_at=start_time,
                        ended_at=end_time,
                        message=skip_msg,
                    )
                )
                result.pop("_skipped", None)
                result.pop("_skip_message", None)
                result["node_status"] = {node_name: "skipped"}
                return result

            # 3. Mark node as done and emit completed event
            await event_manager.emit(
                ProgressEvent(
                    run_id=run_id,
                    node=node_name,
                    status="done",
                    started_at=start_time,
                    ended_at=end_time,
                    message=f"Node '{node_name}' completed successfully.",
                )
            )

            result["node_status"] = {node_name: "done"}
            return result

        except asyncio.CancelledError:
            end_time = utc_iso_now()
            logger.warning("Node '%s' cancelled during execution.", node_name)
            await event_manager.emit(
                ProgressEvent(
                    run_id=run_id,
                    node=node_name,
                    status="failed",
                    started_at=start_time,
                    ended_at=end_time,
                    message=f"Node '{node_name}' execution was cancelled.",
                )
            )
            raise

        except Exception as exc:  # noqa: BLE001
            end_time = utc_iso_now()
            err_msg = str(exc) or type(exc).__name__
            logger.error("Error executing node '%s': %s", node_name, exc, exc_info=True)

            await event_manager.emit(
                ProgressEvent(
                    run_id=run_id,
                    node=node_name,
                    status="failed",
                    started_at=start_time,
                    ended_at=end_time,
                    message=f"Node '{node_name}' failed: {err_msg}",
                )
            )

            if fatal or isinstance(exc, FatalNodeError):
                raise

            # Non-fatal: isolate error and allow graph conditional edges to decide flow
            return {
                "node_status": {node_name: "failed"},
                "errors": {node_name: err_msg},
            }

    return wrapped_node
