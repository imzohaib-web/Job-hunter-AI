from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api import api_router
from app.api.middleware import ServiceKeyMiddleware
from app.core.config import get_settings
from app.services.file_validator import FileValidationError

logger = logging.getLogger("jobpilot.main")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    try:
        from app.embeddings.model import get_embedding_model

        get_embedding_model()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not preload embedding model at startup: %s", exc)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="JobPilot AI Service",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "production" else None,
        lifespan=lifespan,
    )
    app.add_middleware(ServiceKeyMiddleware, settings=settings)

    @app.exception_handler(FileValidationError)
    async def file_validation_exception_handler(
        _request: Request, exc: FileValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                }
            },
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            code = str(exc.detail.get("code", "HTTP_ERROR"))
            message = str(exc.detail.get("message", "HTTP error occurred"))
            details: Any = exc.detail.get("details")
        else:
            code = "HTTP_ERROR"
            message = str(exc.detail)
            details = None

        content: dict[str, Any] = {
            "error": {
                "code": code,
                "message": message,
            }
        }
        if details is not None:
            content["error"]["details"] = details

        return JSONResponse(status_code=exc.status_code, content=content)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed",
                    "details": exc.errors(),
                }
            },
        )

    app.include_router(api_router)
    return app


app = create_app()
