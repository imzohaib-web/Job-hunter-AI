from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.embeddings.model import get_model_status, is_model_ready
from app.schemas.health import HealthResponse, ReadyResponse, VersionResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Pure liveness check: returns 200 OK immediately and never waits on models."""
    return HealthResponse()


@router.get("/version", response_model=VersionResponse)
@router.get("/api/version", response_model=VersionResponse)
def get_version() -> VersionResponse:
    settings = get_settings()
    return VersionResponse(
        service="ai-service",
        git_sha=settings.git_sha,
        build_time=settings.build_time,
        pipeline_version=settings.pipeline_version,
    )


@router.get(
    "/ready",
    response_model=ReadyResponse,
    responses={503: {"description": "Service not ready (model still loading)"}},
)
def get_ready() -> ReadyResponse | JSONResponse:
    """Readiness check: returns 200 when embedding model is loaded, 503 otherwise."""
    status = get_model_status()
    if is_model_ready():
        return ReadyResponse(
            status="ready",
            model_loaded=True,
            model_name=status["model_name"],
            detail="Embedding model is loaded and ready",
        )

    error_msg = status["error"]
    detail = (
        f"Embedding model loading failed: {error_msg}"
        if error_msg
        else "Embedding model is still loading in background"
    )
    return JSONResponse(
        status_code=503,
        content={
            "status": "not_ready",
            "service": "ai-service",
            "model_loaded": False,
            "model_name": status["model_name"],
            "detail": detail,
        },
    )
