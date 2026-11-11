from fastapi import FastAPI

from app.api import api_router
from app.api.middleware import ServiceKeyMiddleware
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="JobPilot AI Service",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "production" else None,
    )
    app.add_middleware(ServiceKeyMiddleware, settings=settings)
    app.include_router(api_router)
    return app


app = create_app()
