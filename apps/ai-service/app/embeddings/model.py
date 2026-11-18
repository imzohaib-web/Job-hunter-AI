from __future__ import annotations

import asyncio
import logging
import os
import sys
import threading
from typing import Any

# Prevent broken TensorFlow protobuf and pyarrow access violation conflicts on Windows
if "tensorflow" not in sys.modules:
    sys.modules["tensorflow"] = None  # type: ignore[assignment]
if "pyarrow" not in sys.modules:
    sys.modules["pyarrow"] = None  # type: ignore[assignment]

# Default to offline cache for fast loading without network hangs
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

from app.core.config import get_settings

logger = logging.getLogger("jobpilot.embeddings")

_EMBEDDING_MODEL_INSTANCE: Any = None
_MODEL_LOCK = threading.Lock()
_MODEL_LOADING: bool = False
_MODEL_LOADED: bool = False
_MODEL_ERROR: str | None = None


def is_model_ready() -> bool:
    """Check if the embedding model is loaded and ready to serve requests."""
    return _MODEL_LOADED and _EMBEDDING_MODEL_INSTANCE is not None


def get_model_status() -> dict[str, Any]:
    """Return model loading status dictionary."""
    settings = get_settings()
    model_name = settings.embedding_model or "sentence-transformers/all-MiniLM-L6-v2"
    return {
        "ready": is_model_ready(),
        "loading": _MODEL_LOADING,
        "model_name": model_name,
        "error": _MODEL_ERROR,
    }


def get_embedding_model() -> Any:
    """Return singleton SentenceTransformer instance loaded at startup or on demand."""
    global _EMBEDDING_MODEL_INSTANCE, _MODEL_LOADING, _MODEL_LOADED, _MODEL_ERROR
    if _EMBEDDING_MODEL_INSTANCE is None:
        with _MODEL_LOCK:
            if _EMBEDDING_MODEL_INSTANCE is None:
                _MODEL_LOADING = True
                _MODEL_ERROR = None
                try:
                    import os
                    import torch
                    from sentence_transformers import SentenceTransformer

                    # Set PyTorch thread count to container/host CPU count (main thread only to avoid deadlock)
                    cpu_count = os.cpu_count() or 4
                    try:
                        if threading.current_thread() is threading.main_thread():
                            torch.set_num_threads(cpu_count)
                    except Exception:
                        pass

                    settings = get_settings()
                    model_name = (
                        settings.embedding_model or "sentence-transformers/all-MiniLM-L6-v2"
                    )
                    logger.info("Loading embedding model '%s' (threads=%d)...", model_name, cpu_count)
                    try:
                        instance = SentenceTransformer(model_name, local_files_only=True)
                    except Exception:
                        instance = SentenceTransformer(model_name)
                    instance.max_seq_length = 256
                    _EMBEDDING_MODEL_INSTANCE = instance
                    _MODEL_LOADED = True
                    logger.info("Embedding model '%s' loaded successfully.", model_name)
                except Exception as exc:
                    _MODEL_ERROR = str(exc)
                    _MODEL_LOADED = False
                    logger.exception("Failed to load embedding model: %s", exc)
                    raise
                finally:
                    _MODEL_LOADING = False
    return _EMBEDDING_MODEL_INSTANCE


async def preload_embedding_model_background() -> None:
    """Preload and warm embedding model in a separate background thread without blocking startup."""
    try:
        model = await asyncio.to_thread(get_embedding_model)
        # Warm inference so weights and PyTorch kernels are ready in memory
        await asyncio.to_thread(model.encode, ["warmup text for jobpilot search"], batch_size=1)
        logger.info("Embedding model warmed successfully.")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Background model preload encountered an error: %s", exc)


def batch_encode(
    texts: list[str],
    batch_size: int = 32,
    normalize: bool = True,
) -> list[list[float]]:
    """Batch-encode a list of strings into normalized vector embeddings."""
    if not texts:
        return []

    model = get_embedding_model()
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        normalize_embeddings=normalize,
    )
    # Convert numpy array to list of float lists
    return [vec.tolist() for vec in embeddings]


async def async_batch_encode(
    texts: list[str],
    batch_size: int = 32,
    normalize: bool = True,
) -> list[list[float]]:
    """Non-blocking batch encode running on separate worker thread to keep event loop free."""
    if not texts:
        return []
    return await asyncio.to_thread(batch_encode, texts, batch_size=batch_size, normalize=normalize)


def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """Compute cosine similarity between two float vectors.

    If vectors are pre-normalized, dot product is identical to cosine similarity.
    """
    if len(vec1) != len(vec2) or not vec1:
        return 0.0

    dot = 0.0
    norm1 = 0.0
    norm2 = 0.0

    for a, b in zip(vec1, vec2, strict=True):
        dot += a * b
        norm1 += a * a
        norm2 += b * b

    if norm1 <= 0.0 or norm2 <= 0.0:
        return 0.0

    return float(dot / ((norm1**0.5) * (norm2**0.5)))
