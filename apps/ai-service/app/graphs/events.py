from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator

from app.schemas.graph import ProgressEvent

logger = logging.getLogger("jobpilot.graphs.events")


class GraphEventManager:
    """Pub/sub event bus managing SSE streaming and snapshot event history for graph runs."""

    def __init__(self) -> None:
        self._history: dict[str, list[ProgressEvent]] = {}
        self._subscribers: dict[str, set[asyncio.Queue[ProgressEvent | None]]] = {}
        self._completed_runs: set[str] = set()
        self._lock = asyncio.Lock()

    def get_events(self, run_id: str) -> list[ProgressEvent]:
        """Return full sequential history of progress events for a run."""
        return list(self._history.get(run_id, []))

    async def emit(self, event: ProgressEvent) -> None:
        """Record and broadcast a progress event to all active SSE subscribers."""
        run_id = event.run_id
        async with self._lock:
            if run_id not in self._history:
                self._history[run_id] = []
            self._history[run_id].append(event)

            subscribers = self._subscribers.get(run_id, set()).copy()

        for queue in subscribers:
            await queue.put(event)

    async def complete_stream(self, run_id: str) -> None:
        """Signal completion to all active SSE subscriber queues for run_id."""
        async with self._lock:
            self._completed_runs.add(run_id)
            subscribers = self._subscribers.get(run_id, set()).copy()

        for queue in subscribers:
            await queue.put(None)  # Sentinel indicates end of stream

    async def subscribe(self, run_id: str) -> AsyncGenerator[ProgressEvent, None]:
        """Subscribe to progress events for a run, replaying past events first."""
        queue: asyncio.Queue[ProgressEvent | None] = asyncio.Queue()

        async with self._lock:
            already_completed = run_id in self._completed_runs
            if not already_completed:
                if run_id not in self._subscribers:
                    self._subscribers[run_id] = set()
                self._subscribers[run_id].add(queue)

            past_events = list(self._history.get(run_id, []))

        # Replay already recorded history
        for past_event in past_events:
            yield past_event

        if already_completed:
            return

        try:
            while True:
                item = await queue.get()
                if item is None:
                    # Stream completed
                    break
                yield item
        finally:
            async with self._lock:
                if run_id in self._subscribers and queue in self._subscribers[run_id]:
                    self._subscribers[run_id].remove(queue)
                    if not self._subscribers[run_id]:
                        del self._subscribers[run_id]

    def clear(self) -> None:
        """Clear all event history and subscribers (for test isolation)."""
        self._history.clear()
        self._subscribers.clear()
        self._completed_runs.clear()


# Global singleton event manager
event_manager = GraphEventManager()
