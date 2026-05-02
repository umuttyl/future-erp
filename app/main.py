from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings
from app.core.db import init_db


def create_app() -> FastAPI:
    app = FastAPI(title=settings.PROJECT_NAME)

    @app.on_event("startup")
    def _on_startup() -> None:
        try:
            init_db()
        except RuntimeError:
            # Dev ortamında Postgres kapalıyken bile API dokümantasyonu açılabilsin.
            if settings.ENV != "dev":
                raise

    app.include_router(api_router, prefix="/api")
    return app


app = create_app()

