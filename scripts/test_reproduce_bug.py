import asyncio
import os
import sys
import traceback
from pathlib import Path

# Unbuffered output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(line_buffering=True)

if "tensorflow" not in sys.modules:
    sys.modules["tensorflow"] = None
if "pyarrow" not in sys.modules:
    sys.modules["pyarrow"] = None

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

REPO_ROOT = Path(__file__).resolve().parent.parent
AI_SERVICE_DIR = REPO_ROOT / "apps" / "ai-service"
sys.path.insert(0, str(AI_SERVICE_DIR))
sys.path.insert(0, str(REPO_ROOT))

from scripts.debug_discovery import load_candidate_profile_and_query
from app.services.discovery_pipeline import run_discovery
from app.services.job_sources.aggregator import _AGGREGATOR_CACHE
from app.services.job_sources.remotive import RemotiveSource
from app.schemas.job import JobPosting
import app.embeddings.model as emb_model

sample_jobs = [
    JobPosting(
        id="remotive-1",
        source="remotive",
        external_id="101",
        title="Junior Full Stack Developer",
        company="TechCorp",
        location="Remote (worldwide)",
        remote=True,
        description="Looking for Junior Full Stack Developer with React, Node.js, and Python.",
        url="https://remotive.com/101",
    ),
    JobPosting(
        id="remotive-2",
        source="remotive",
        external_id="102",
        title="Junior Full Stack Developer, Europe",
        company="TechCorp",
        location="Remote - Europe",
        remote=True,
        description="Looking for Junior Full Stack Developer with React, Node.js.",
        url="https://remotive.com/102",
    ),
]

async def mock_search(self, query):
    print(">>> mock RemotiveSource.search called!", flush=True)
    return sample_jobs

RemotiveSource.search = mock_search

async def mock_async_batch_encode(texts, batch_size=32, normalize=True):
    return [[0.1] * 384 for _ in texts]

emb_model.async_batch_encode = mock_async_batch_encode

async def main():
    profile, query, prefs = load_candidate_profile_and_query()
    sources = ["remotive"]

    print("=== RUN 1 ===")
    res1 = await run_discovery(
        profile=profile,
        preferences=prefs,
        query=query,
        sources=sources,
        llm_rerank=False,
    )
    print(f"Run 1 success: {len(res1.get('data', {}).get('ranked_jobs', []))} ranked jobs")

    print("\n=== RUN 2 (Immediate second run with warm cache) ===")
    try:
        res2 = await run_discovery(
            profile=profile,
            preferences=prefs,
            query=query,
            sources=sources,
            llm_rerank=False,
        )
        print(f"Run 2 success: {len(res2.get('data', {}).get('ranked_jobs', []))} ranked jobs")
    except Exception as e:
        print("Run 2 FAILED with exception:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
