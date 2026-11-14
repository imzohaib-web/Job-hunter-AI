from __future__ import annotations

from app.services.job_sources.adzuna import AdzunaSource
from app.services.job_sources.aggregator import JobSourceAggregator, compute_job_hash
from app.services.job_sources.arbeitnow import ArbeitnowSource
from app.services.job_sources.base import JobSource, RateLimitPolicy
from app.services.job_sources.cleaner import (
    detect_seniority,
    normalize_company,
    normalize_location,
    normalize_title,
    parse_salary_range,
    strip_html,
)
from app.services.job_sources.demo import DemoSource
from app.services.job_sources.greenhouse import GreenhouseBoardSource
from app.services.job_sources.jsearch import JSearchSource
from app.services.job_sources.lever import LeverBoardSource
from app.services.job_sources.remotive import RemotiveSource
from app.services.job_sources.skill_extractor import extract_skills

__all__ = [
    "AdzunaSource",
    "ArbeitnowSource",
    "DemoSource",
    "GreenhouseBoardSource",
    "JSearchSource",
    "JobSource",
    "JobSourceAggregator",
    "LeverBoardSource",
    "RateLimitPolicy",
    "RemotiveSource",
    "compute_job_hash",
    "detect_seniority",
    "extract_skills",
    "normalize_company",
    "normalize_location",
    "normalize_title",
    "parse_salary_range",
    "strip_html",
]
