from __future__ import annotations

import math
import re
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from app.schemas.job import JobPosting
from app.schemas.profile import ParsedProfile
from app.services.ranking.bm25_scorer import compute_bm25_scores

TECH_TITLE_KEYWORDS = [
    "developer",
    "engineer",
    "programmer",
    "software",
    "full stack",
    "fullstack",
    "frontend",
    "backend",
    "web",
    "react",
    "node",
    "python",
    "ml",
    "ai",
    "data",
    "devops",
    "sre",
    "cloud",
    "qa",
    "sdet",
]

# Canonical skill aliases for ultra-fast matching
SKILL_ALIASES: dict[str, list[str]] = {
    "react": ["react", "react.js", "reactjs"],
    "node.js": ["node", "node.js", "nodejs"],
    "python": ["python", "python3"],
    "javascript": ["javascript", "js", "es6"],
    "typescript": ["typescript", "ts"],
    "fastapi": ["fastapi", "fast-api"],
    "mongodb": ["mongodb", "mongo"],
    "postgresql": ["postgresql", "postgres"],
    "docker": ["docker"],
    "kubernetes": ["kubernetes", "k8s"],
    "aws": ["aws", "amazon web services"],
    "git": ["git", "github", "gitlab"],
    "rest": ["rest", "restful", "rest api"],
    "graphql": ["graphql"],
    "next.js": ["next.js", "nextjs"],
    "vue": ["vue", "vue.js", "vuejs"],
    "angular": ["angular"],
    "java": ["java"],
    "c++": ["c++"],
    "golang": ["go", "golang"],
    "llm": ["llm", "large language model", "rag"],
}


def _compute_fast_title_score(
    job_title: str,
    target_titles: list[str],
    profile_title: str | None,
) -> float:
    title_lower = job_title.lower()

    # 1. Exact match with profile title or target titles
    candidates = [t.lower().strip() for t in target_titles if t.strip()]
    if profile_title and profile_title.strip():
        candidates.append(profile_title.lower().strip())

    for target in candidates:
        if target in title_lower:
            return 100.0

    # 2. Match individual words in target titles
    matched_words = 0
    total_words = 0
    for target in candidates:
        words = [w for w in re.findall(r"\w+", target) if len(w) > 2]
        total_words += len(words)
        for w in words:
            if w in title_lower:
                matched_words += 1

    if total_words > 0 and matched_words > 0:
        ratio = matched_words / max(total_words, 1)
        return min(90.0, 50.0 + (ratio * 40.0))

    # 3. Match any engineering keyword
    eng_matches = sum(1 for kw in TECH_TITLE_KEYWORDS if kw in title_lower)
    if eng_matches >= 2:
        return 65.0
    if eng_matches == 1:
        return 45.0

    return 10.0


def _compute_fast_skill_score(
    text: str,
    candidate_skills: list[str],
) -> float:
    text_lower = text.lower()
    if not candidate_skills:
        return 0.0

    matched = 0
    for skill in candidate_skills:
        s_clean = skill.lower().strip()
        aliases = SKILL_ALIASES.get(s_clean, [s_clean])
        for alias in aliases:
            # Word boundary check
            pattern = r"\b" + re.escape(alias) + r"\b"
            if re.search(pattern, text_lower):
                matched += 1
                break

    ratio = matched / max(len(candidate_skills), 1)
    return min(100.0, ratio * 100.0)


def _compute_fast_recency_bonus(posted_at: datetime | str | None) -> float:
    if not posted_at:
        return 0.0

    dt: datetime | None = None
    if isinstance(posted_at, datetime):
        dt = posted_at
    elif isinstance(posted_at, str):
        try:
            dt = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
        except Exception:
            return 0.0

    if not dt:
        return 0.0

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    days_old = (now - dt).total_seconds() / 86400.0

    if days_old <= 3.0:
        return 5.0
    if days_old <= 7.0:
        return 3.0
    if days_old <= 30.0:
        return 1.0
    return 0.0


class FastJobPreselector:
    """Ultra-fast deterministic pre-selection of candidate postings for full ranking."""

    def __init__(self, target_count: int = 150, max_source_ratio: float = 0.6) -> None:
        self.target_count = target_count
        self.max_source_ratio = max_source_ratio

    def preselect(
        self,
        jobs: list[JobPosting],
        profile: ParsedProfile,
        target_titles: list[str] | None = None,
    ) -> list[JobPosting]:
        if not jobs:
            return []

        if len(jobs) <= self.target_count:
            return list(jobs)

        t0 = time.perf_counter()
        targets = list(target_titles or [])
        profile_title = getattr(profile, "title", None)
        if not profile_title and profile.experience:
            profile_title = profile.experience[0].title

        cand_skills = [s.name for s in profile.skills]
        profile_text = f"{profile_title or ''} {profile.summary or ''} {' '.join(cand_skills)}"

        job_texts = [f"{j.title} {j.description[:1200]}" for j in jobs]
        bm25_scores = compute_bm25_scores(profile_text, job_texts)

        scored_items: list[tuple[float, JobPosting]] = []
        is_junior_profile = any(
            w in (f"{profile_title or ''} {profile.summary or ''}").lower()
            for w in ["intern", "junior", "student", "entry"]
        )

        for i, job in enumerate(jobs):
            corpus = f"{job.title} {job.description[:1000]}"
            t_score = _compute_fast_title_score(job.title, targets, profile_title)
            s_score = _compute_fast_skill_score(corpus, cand_skills)
            bm_score = bm25_scores[i]
            r_bonus = _compute_fast_recency_bonus(job.posted_at)

            # Seniority bias adjustment in preselection
            seniority_adj = 0.0
            t_lower = job.title.lower()
            if is_junior_profile:
                if any(w in t_lower for w in ["intern", "junior", "entry", "trainee", "fresher", "associate"]):
                    seniority_adj = 15.0
                elif any(w in t_lower for w in ["senior", "lead", "principal", "staff", "director", "head of"]):
                    seniority_adj = -15.0

            combined_fast_score = (
                (t_score * 0.40)
                + (s_score * 0.35)
                + (bm_score * 0.20)
                + r_bonus
                + seniority_adj
            )
            scored_items.append((combined_fast_score, job))

        # Sort strictly by score descending, with deterministic external_id tie-breaking
        scored_items.sort(key=lambda x: (-x[0], x[1].external_id))

        # Enforce source diversity (no source takes more than max_source_ratio of target_count)
        max_per_source = max(10, int(self.target_count * self.max_source_ratio))
        source_counts: Counter[str] = Counter()
        selected: list[JobPosting] = []
        deferred: list[JobPosting] = []

        for score, job in scored_items:
            src = job.source.lower()
            if source_counts[src] < max_per_source:
                source_counts[src] += 1
                selected.append(job)
                if len(selected) >= self.target_count:
                    break
            else:
                deferred.append(job)

        # Fill any remainder up to target_count from deferred if needed
        if len(selected) < self.target_count and deferred:
            remainder = self.target_count - len(selected)
            selected.extend(deferred[:remainder])

        elapsed = time.perf_counter() - t0
        return selected
