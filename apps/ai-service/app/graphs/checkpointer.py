from __future__ import annotations

from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver

_GLOBAL_CHECKPOINTER: BaseCheckpointSaver[Any] | None = None


def get_checkpointer() -> BaseCheckpointSaver[Any]:
    """Return the global checkpoint saver instance for graph execution persistence."""
    global _GLOBAL_CHECKPOINTER
    if _GLOBAL_CHECKPOINTER is None:
        _GLOBAL_CHECKPOINTER = MemorySaver()
    return _GLOBAL_CHECKPOINTER


def reset_checkpointer() -> BaseCheckpointSaver[Any]:
    """Reset checkpoint storage (used in test fixtures)."""
    global _GLOBAL_CHECKPOINTER
    _GLOBAL_CHECKPOINTER = MemorySaver()
    return _GLOBAL_CHECKPOINTER
