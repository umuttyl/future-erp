"""Yapilandirilmis gunluge (structured logging).

- ENV=dev / prod disi: konsol renkli cikti (Human-readable)
- ENV=prod: satir bazli JSON (log koleksyonu için)

Kullanım::
    logger = structlog.get_logger(__name__)
    logger.info("order_created", order_id=42, tenant_id=1)
"""
from __future__ import annotations

import logging
import sys
from typing import Any

import structlog

from app.core.config import settings


def configure_logging() -> None:
    """Uygulama baslangıcında bir kez cagirin (lifespan)."""
    lvl_name = getattr(settings, "LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, lvl_name, logging.INFO)

    shared: list[Any] = [
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
    ]

    if settings.ENV == "prod":
        shared.append(structlog.processors.JSONRenderer())
    else:
        shared.append(structlog.dev.ConsoleRenderer(colors=True))

    structlog.configure(
        processors=shared,
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # SQL komut günlüklerını dev'de konsolu doldurmamak için
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
