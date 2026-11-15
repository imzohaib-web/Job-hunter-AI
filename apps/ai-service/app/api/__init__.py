from __future__ import annotations

import logging

from fastapi import APIRouter

from app.api.health import router as health_router
from app.api.v1 import router as v1_router

logger = logging.getLogger("jobpilot.api")

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(v1_router)

try:
    from app.api.graphs import router as graphs_router

    api_router.include_router(graphs_router)
except ImportError as exc:
    logger.warning("Graph orchestration router disabled due to missing dependency: %s", exc)
