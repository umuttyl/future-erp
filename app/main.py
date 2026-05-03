"""FastAPI uygulama factory'si.

Tablo oluşturma Alembic ile:
    alembic upgrade head

Global exception handler'lar tek tip JSON hatasi döner:
    ``{"error": {"code": "...", "message": "..." }}``
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.core.config import settings
from app.core.dev_bootstrap import ensure_dev_demo_users_if_empty
from app.core.exceptions import AppException, InternalError
from app.core.logging import configure_logging

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info(
        "app_startup",
        project=settings.PROJECT_NAME,
        env=settings.ENV,
    )
    ensure_dev_demo_users_if_empty()
    yield
    logger.info("app_shutdown")


def _http_detail_message(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict):
        return str(detail.get("msg", detail))
    return str(detail)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def handle_app_exc(_request: Request, exc: AppException) -> JSONResponse:
        payload: dict[str, Any] = {"error": {"code": exc.code, "message": exc.message}}
        return JSONResponse(status_code=exc.status_code, content=payload)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_exc(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        errors = exc.errors()
        if not errors:
            msg = "Dogrulama hatası."
            return JSONResponse(
                status_code=422,
                content={"error": {"code": "VALIDATION_ERROR", "message": msg}},
            )

        err0 = errors[0]
        loc_parts = [str(x) for x in err0.get("loc", ()) if isinstance(x, (str, int))]
        loc = ".".join(loc_parts) if loc_parts else ""
        detail_msg = err0.get("msg", "Dogrulama hatası")
        msg = f"{loc}: {detail_msg}".strip(": ") if loc else detail_msg
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": msg,
                    "details": errors,
                },
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exc(
        _request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        code_map = {
            404: "NOT_FOUND",
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            409: "CONFLICT",
        }
        code = code_map.get(exc.status_code, f"HTTP_{exc.status_code}")
        payload = {
            "error": {
                "code": code,
                "message": _http_detail_message(exc.detail),
            },
        }
        return JSONResponse(status_code=exc.status_code, content=payload)

    @app.exception_handler(Exception)
    async def handle_unexpected(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "unhandled_exception",
            error_type=type(exc).__name__,
            error=str(exc),
        )
        inner = InternalError()
        payload = {"error": {"code": inner.code, "message": inner.message}}
        return JSONResponse(status_code=inner.status_code, content=payload)


def create_app() -> FastAPI:
    app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)
    register_exception_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
