from __future__ import annotations

import re
from typing import Final

from rank_bm25 import BM25Okapi

WORD_RE: Final[re.Pattern[str]] = re.compile(r"\b[a-z0-9+#.-]{2,}\b")


def tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase lexical words."""
    if not text:
        return []
    return WORD_RE.findall(text.lower())


def compute_bm25_scores(
    query_text: str,
    doc_texts: list[str],
) -> list[float]:
    """Compute normalized 0-100 BM25 scores for docs against query_text."""
    if not doc_texts:
        return []

    tokenized_query = tokenize(query_text)
    if not tokenized_query:
        return [0.0] * len(doc_texts)

    tokenized_corpus = [tokenize(doc) for doc in doc_texts]

    # Ensure corpus has at least some tokens
    has_tokens = any(len(doc) > 0 for doc in tokenized_corpus)
    if not has_tokens:
        return [0.0] * len(doc_texts)

    bm25 = BM25Okapi(tokenized_corpus)
    raw_scores = bm25.get_scores(tokenized_query)

    max_score = float(max(raw_scores)) if len(raw_scores) > 0 else 0.0
    if max_score <= 0.0:
        return [0.0] * len(doc_texts)

    normalized: list[float] = []
    for s in raw_scores:
        score_val = float(s)
        if score_val <= 0.0:
            normalized.append(0.0)
        else:
            # Scale relative to max score and cap at 100
            norm_val = min(100.0, (score_val / max_score) * 100.0)
            normalized.append(round(norm_val, 2))

    return normalized
