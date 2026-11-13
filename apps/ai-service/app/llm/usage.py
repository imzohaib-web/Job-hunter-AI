from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass(frozen=True)
class UsageRecord:
    """Record of an LLM completion call for tracing, metrics, and cost accounting."""

    task_name: str
    provider: str
    model: str
    latency_ms: float
    input_tokens: int
    output_tokens: int
    retries: int
    success: bool
    cost_usd: float = 0.0
    timestamp: float = field(default_factory=time.time)


class UsageRecorder:
    """In-process recorder for LLM usage and cost."""

    def __init__(self) -> None:
        self._records: list[UsageRecord] = []

    def record(self, entry: UsageRecord) -> None:
        """Append a usage record to the in-memory list."""
        self._records.append(entry)

    def get_records(self) -> list[UsageRecord]:
        """Return a copy of all recorded usage entries."""
        return list(self._records)

    def clear(self) -> None:
        """Clear all usage records."""
        self._records.clear()

    @property
    def total_input_tokens(self) -> int:
        return sum(r.input_tokens for r in self._records)

    @property
    def total_output_tokens(self) -> int:
        return sum(r.output_tokens for r in self._records)
