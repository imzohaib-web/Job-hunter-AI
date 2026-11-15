#!/usr/bin/env python3
"""Debug and test each job source adapter in isolation across standard queries.

Verifies connectivity, board slug availability (e.g. 404 detection),
keyword relevance filtering, and remote_only filtering.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Force unbuffered stdout/stderr
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(line_buffering=True)

# Ensure apps/ai-service is on Python path
REPO_ROOT = Path(__file__).resolve().parent.parent
AI_SERVICE_DIR = REPO_ROOT / "apps" / "ai-service"
sys.path.insert(0, str(AI_SERVICE_DIR))

import httpx

from app.core.config import Settings, load_settings
from app.schemas.job import JobQuery
from app.services.job_sources.adzuna import AdzunaSource
from app.services.job_sources.arbeitnow import ArbeitnowSource
from app.services.job_sources.greenhouse import GreenhouseBoardSource
from app.services.job_sources.lever import LeverBoardSource
from app.services.job_sources.remotive import RemotiveSource


async def verify_board_slugs(settings: Settings) -> None:
    """Verify ATS board slugs live and report any 404s."""
    print("=" * 70)
    print("1. ATS BOARD SLUG VERIFICATION")
    print("=" * 70)

    gh_slugs = [s.strip() for s in settings.greenhouse_boards.split(",") if s.strip()]
    lever_slugs = [s.strip() for s in settings.lever_boards.split(",") if s.strip()]

    async with httpx.AsyncClient(timeout=10.0) as client:
        print("\n[Greenhouse Boards]")
        for slug in gh_slugs:
            url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
            try:
                res = await client.get(url)
                if res.status_code == 200:
                    jobs_cnt = len(res.json().get("jobs", []))
                    print(f"  ✓ {slug:<15} HTTP {res.status_code} OK ({jobs_cnt} active jobs)")
                elif res.status_code == 404:
                    print(f"  ✗ {slug:<15} HTTP 404 NOT FOUND (slug does not exist)")
                else:
                    print(f"  ! {slug:<15} HTTP {res.status_code}")
            except Exception as exc:
                print(f"  ! {slug:<15} ERROR: {exc}")

        print("\n[Lever Boards]")
        for slug in lever_slugs:
            url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
            try:
                res = await client.get(url)
                if res.status_code == 200:
                    postings = res.json() if isinstance(res.json(), list) else []
                    print(f"  ✓ {slug:<15} HTTP {res.status_code} OK ({len(postings)} active jobs)")
                elif res.status_code == 404:
                    print(f"  ✗ {slug:<15} HTTP 404 NOT FOUND (slug does not exist)")
                else:
                    print(f"  ! {slug:<15} HTTP {res.status_code}")
            except Exception as exc:
                print(f"  ! {slug:<15} ERROR: {exc}")


async def test_sources(settings: Settings) -> None:
    """Test all source adapters across standard test queries."""
    queries = [
        "full stack developer",
        "software engineer intern",
        "python developer",
    ]
    remote_options = [False, True]

    adapters = [
        ("remotive", RemotiveSource()),
        ("arbeitnow", ArbeitnowSource()),
        ("adzuna", AdzunaSource(settings)),
        ("greenhouse", GreenhouseBoardSource(settings)),
        ("lever", LeverBoardSource(settings)),
    ]

    print("\n" + "=" * 70)
    print("2. ADAPTER TEST MATRIX (direct calls with query variants)")
    print("=" * 70)

    for q_text in queries:
        for remote_only in remote_options:
            rem_label = "remote_only=True" if remote_only else "remote_only=False"
            print(f"\n>>> Query: '{q_text}' | {rem_label} | location=None")
            print("-" * 70)

            query_obj = JobQuery(
                keywords=q_text,
                location=None,
                remote_only=remote_only,
                limit=30,
            )

            for name, adapter in adapters:
                if not adapter.is_available:
                    print(f"  [{name:<10}] STATUS: skipped (missing credentials) | HTTP: N/A | Count: 0")
                    continue

                try:
                    postings = await adapter.search(query_obj)
                    status_str = "OK"
                    count = len(postings)
                    titles = [f"'{p.title}' ({p.company}, {p.location})" for p in postings[:3]]
                    sample_titles = "; ".join(titles) if titles else "None"

                    print(f"  [{name:<10}] STATUS: {status_str:<4} | Count: {count:>3} | Sample: {sample_titles[:90]}")
                except httpx.HTTPStatusError as exc:
                    print(f"  [{name:<10}] STATUS: FAILED | HTTP: {exc.response.status_code} | Error: {exc}")
                except Exception as exc:
                    print(f"  [{name:<10}] STATUS: ERROR  | Error: {exc}")


async def main() -> None:
    env_file = AI_SERVICE_DIR / ".env"
    settings = load_settings(env_file=str(env_file) if env_file.exists() else None)
    await verify_board_slugs(settings)
    await test_sources(settings)


if __name__ == "__main__":
    asyncio.run(main())
