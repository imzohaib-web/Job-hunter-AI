from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime

from app.core.config import Settings, get_settings
from app.schemas.job import JobPosting, JobQuery
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import detect_seniority
from app.services.job_sources.skill_extractor import extract_skills

logger = logging.getLogger("ai_service.job_sources.demo")

DEMO_COMPANIES = [
    ("TechNova AI", "San Francisco, CA", True),
    ("DataForge Labs", "New York, NY", False),
    ("CloudMind Systems", "Austin, TX", True),
    ("NeuralPath Inc", "Seattle, WA", True),
    ("QuantumSoft", "Boston, MA", False),
    ("Aether Dynamics", "Berlin, Germany", True),
    ("Apex Robotics", "London, UK", True),
    ("VectorFlow Systems", "Remote", True),
]


class DemoSource(JobSource):
    """Synthetic demo jobs adapter — OFF by default.

    Must NEVER be mixed into production searches unless USE_DEMO_JOBS=true.
    Every job produced has is_demo=True.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def name(self) -> str:
        return "demo"

    @property
    def is_available(self) -> bool:
        """Only available when explicitly enabled by USE_DEMO_JOBS=true."""
        return bool(self._settings.use_demo_jobs)

    @property
    def rate_limit(self) -> RateLimitPolicy:
        return RateLimitPolicy(requests_per_minute=1000, timeout_seconds=1.0)

    async def search(self, query: JobQuery) -> list[JobPosting]:
        # Hard gate: Never produce demo jobs unless explicitly enabled in settings
        if not self.is_available:
            logger.info("DemoSource is OFF (USE_DEMO_JOBS=false). Returning empty list.")
            return []

        title_keyword = query.keywords.strip() if query.keywords else "Software Engineer"
        loc_filter = query.location.strip() if query.location else None
        target_seniority = query.seniority.lower() if query.seniority else "senior"

        postings: list[JobPosting] = []
        now_iso = datetime.now(UTC).isoformat()

        for idx, (company, default_loc, is_remote) in enumerate(DEMO_COMPANIES):
            if query.remote_only and not is_remote:
                continue

            loc = loc_filter if loc_filter else default_loc
            if loc_filter:
                matches_loc = loc_filter.lower() in loc.lower() or (
                    is_remote and "remote" in loc_filter.lower()
                )
                if not matches_loc:
                    continue

            prefix = f"{target_seniority.title()} " if target_seniority != "mid" else ""
            full_title = f"{prefix}{title_keyword}"
            slug_seed = f"{company}-{full_title}-{idx}"
            ext_id = f"demo-{hashlib.md5(slug_seed.encode()).hexdigest()[:10]}"

            desc = (
                f"About the Role:\n"
                f"{company} is seeking a {full_title} for our engineering team.\n\n"
                f"Responsibilities:\n"
                f"- Architect scalable backend services using Python, FastAPI, and PostgreSQL.\n"
                f"- Implement low-latency LLM agent pipelines using LangChain and LangGraph.\n"
                f"- Collaborate with DevOps to deploy microservices on Kubernetes.\n\n"
                f"Requirements:\n"
                f"- 3+ years experience with Python, TypeScript, Docker, and Cloud architectures.\n"
                f"- Strong knowledge of SQL, RESTful APIs, and CI/CD best practices.\n"
                f"- Experience with AI/ML tools and prompt engineering is a plus."
            )

            skills = extract_skills(desc)
            seniority = detect_seniority(full_title, desc)

            posting = JobPosting(
                source=self.name,
                external_id=ext_id,
                title=full_title,
                company=company,
                location=loc,
                remote=is_remote,
                salary_min=130000.0 + (idx * 5000),
                salary_max=170000.0 + (idx * 5000),
                currency="USD",
                description=desc,
                url=f"https://demo.example.com/jobs/{ext_id}",
                posted_at=now_iso,
                skills_required=skills,
                seniority=seniority,
                is_demo=True,  # Mandatory demo marker
            )
            postings.append(posting)
            if len(postings) >= query.limit:
                break

        return postings
