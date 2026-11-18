import asyncio
import sys
import traceback
from pathlib import Path
import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "apps" / "ai-service"))

from app.schemas.job import JobQuery
from app.services.job_sources.remoteok import RemoteOKSource
from app.services.job_sources.jobicy import JobicySource
from app.services.job_sources.himalayas import HimalayasSource
from app.services.job_sources.weworkremotely import WeWorkRemotelySource
from app.services.job_sources.lever import LeverBoardSource

async def main():
    query = JobQuery(keywords="developer", sources=["remoteok", "jobicy", "himalayas", "weworkremotely", "lever"])
    
    # 1. Test Lever directly with spotify and palantir
    print("=== Testing Lever slugs ===")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
        for slug in ["spotify", "palantir", "netflix", "twitch"]:
            url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
            try:
                r = await client.get(url)
                body_len = len(r.json()) if r.status_code == 200 else len(r.text)
                print(f"Lever slug '{slug}': HTTP {r.status_code}, data length: {body_len}")
            except Exception as e:
                print(f"Lever slug '{slug}': Error {type(e).__name__}: {e}")

    # 2. Test each adapter directly
    adapters = [
        ("RemoteOK", RemoteOKSource()),
        ("Jobicy", JobicySource()),
        ("Himalayas", HimalayasSource()),
        ("WeWorkRemotely", WeWorkRemotelySource()),
        ("Lever", LeverBoardSource()),
    ]

    for name, adapter in adapters:
        print(f"\n=== Testing {name} Adapter ===")
        try:
            jobs = await adapter.search(query)
            status_code = getattr(adapter, "last_http_status", None)
            query_sent = getattr(adapter, "last_query_sent", "")
            print(f"{name} -> HTTP: {status_code}, Kept: {len(jobs)}, Query: {query_sent}")
            for idx, j in enumerate(jobs[:3], 1):
                print(f"  {idx}. {j.title} @ {j.company} | Remote: {j.remote} | Loc: {j.location}")
        except Exception as e:
            print(f"{name} -> Exception {type(e).__name__}: {e}")
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
