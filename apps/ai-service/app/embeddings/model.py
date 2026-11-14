from __future__ import annotations

import logging
import sys
from typing import Any

# Prevent broken TensorFlow protobuf and pyarrow access violation conflicts on Windows
if "tensorflow" not in sys.modules:
    sys.modules["tensorflow"] = None  # type: ignore[assignment]
if "pyarrow" not in sys.modules:
    sys.modules["pyarrow"] = None  # type: ignore[assignment]

from app.core.config import get_settings

logger = logging.getLogger("jobpilot.embeddings")

_EMBEDDING_MODEL_INSTANCE: Any = None


def get_embedding_model() -> Any:
    """Return singleton SentenceTransformer instance loaded at startup."""
    global _EMBEDDING_MODEL_INSTANCE
    if _EMBEDDING_MODEL_INSTANCE is None:
        from sentence_transformers import SentenceTransformer

        settings = get_settings()
        model_name = settings.embedding_model or "sentence-transformers/all-MiniLM-L6-v2"
        logger.info("Loading embedding model '%s'...", model_name)
        _EMBEDDING_MODEL_INSTANCE = SentenceTransformer(model_name)
        logger.info("Embedding model '%s' loaded successfully.", model_name)
    return _EMBEDDING_MODEL_INSTANCE


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
