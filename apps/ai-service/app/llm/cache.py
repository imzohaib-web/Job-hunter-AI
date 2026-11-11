from __future__ import annotations

import collections
import hashlib
import time

from pydantic import BaseModel


def make_cache_key(task_name: str, rendered_prompt: str, model: str) -> str:
    """Generate SHA256 key from task_name + rendered prompt + model."""
    raw = f"{task_name}{rendered_prompt}{model}".encode()
    return hashlib.sha256(raw).hexdigest()


class LLMCache:
    """In-memory LRU cache with TTL support."""

    def __init__(
        self,
        enabled: bool = True,
        ttl_seconds: int = 3600,
        capacity: int = 1000,
    ) -> None:
        self.enabled = enabled
        self.ttl_seconds = ttl_seconds
        self.capacity = capacity
        self._store: collections.OrderedDict[str, tuple[float, BaseModel]] = (
            collections.OrderedDict()
        )

    def get(self, key: str) -> BaseModel | None:
        """Retrieve item if present and unexpired."""
        if not self.enabled:
            return None

        entry = self._store.get(key)
        if entry is None:
            return None

        created_at, value = entry
        if time.time() - created_at > self.ttl_seconds:
            # Expired
            self._store.pop(key, None)
            return None

        # LRU touch
        self._store.move_to_end(key)
        return value

    def set(self, key: str, value: BaseModel) -> None:
        """Store item in LRU cache, evicting oldest if capacity reached."""
        if not self.enabled:
            return

        if key in self._store:
            self._store.pop(key, None)
        elif len(self._store) >= self.capacity:
            self._store.popitem(last=False)

        self._store[key] = (time.time(), value)

    def clear(self) -> None:
        """Clear all cached entries."""
        self._store.clear()

    def __len__(self) -> int:
        return len(self._store)
