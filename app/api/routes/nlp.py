from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_current_principal, get_tenant_ctx, require_permission
from app.core.permissions import NLP_QUERY_EXECUTE
from app.core.rate_limit import limiter
from app.models.tenant import Tenant
from app.services.nlp_assistant import run_nlp_query

logger = structlog.get_logger(__name__)

router = APIRouter()
nlp_chat_api_router = APIRouter()

NLP_FRIENDLY_FAILURE = (
    "Üzgünüm, bu isteğinizi veritabanından çekemedim. Daha farklı bir şekilde sorabilir misiniz?"
)


class NLQueryRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class ChartHint(BaseModel):
    type: str = Field(default="none")
    x: Optional[str] = None
    y: Optional[str] = None
    title: str = ""


class NLQueryResponse(BaseModel):
    sql: str
    columns: List[str]
    data: List[Dict[str, Any]]
    answer: str
    chart_hint: Optional[ChartHint] = None


def _empty_chart() -> ChartHint:
    return ChartHint(type="none", x=None, y=None, title="")


def _friendly_response(message: str) -> NLQueryResponse:
    return NLQueryResponse(
        sql="",
        columns=[],
        data=[],
        answer=message,
        chart_hint=_empty_chart(),
    )


def _is_smalltalk_greeting(text: str) -> bool:
    t = text.strip().lower()
    return any(
        x in t
        for x in (
            "merhaba",
            "selam",
            "hey",
            "günaydın",
            "gunaydin",
            "iyi günler",
            "iyi aksamlar",
            "nasılsın",
            "nasilsin",
            "ne yapabilirsin",
        )
    )


def _nlp_query_handler(
    payload: NLQueryRequest,
    ctx: TenantContext,
    db: Session,
    principal: AuthPrincipal | None = None,
) -> NLQueryResponse:
    """200 + NLQueryResponse; beklenmeyen hatalarda 500 yerine düşmeyen mesaj."""
    try:
        if _is_smalltalk_greeting(payload.text):
            return _friendly_response(
                "Merhaba! Future ERP AI sistemine hoş geldiniz, size nasıl yardımcı olabilirim?"
            )

        # Aktif modülleri ve şirket adını tenant'tan al (role-aware SQL whitelist + prompt için)
        active_modules: list[str] | None = None
        tenant_name: str = ""
        user_role = principal.role if principal else "manager"
        if principal:
            tenant = db.get(Tenant, principal.tenant_id)
            if tenant:
                active_modules = tenant.active_modules
                tenant_name = tenant.name or ""

        result = run_nlp_query(
            db,
            user_text=payload.text,
            tenant_id=ctx.tenant_id,
            user_role=user_role,
            active_modules=active_modules,
            tenant_name=tenant_name,
        )
        ch = result.chart_hint
        chart_out: Optional[ChartHint] = None
        if isinstance(ch, dict):
            chart_out = ChartHint(
                type=str(ch.get("type", "none")),
                x=ch.get("x") if ch.get("x") is not None else None,
                y=ch.get("y") if ch.get("y") is not None else None,
                title=str(ch.get("title") or ""),
            )
        return NLQueryResponse(
            sql=result.sql,
            columns=result.columns,
            data=result.data,
            answer=result.answer,
            chart_hint=chart_out,
        )
    except Exception:  # noqa: BLE001
        logger.exception("nlp_query_handler_failed", extra={"tenant_id": ctx.tenant_id})
        return _friendly_response(NLP_FRIENDLY_FAILURE)


@router.post("/query", response_model=NLQueryResponse)
@limiter.limit("20/minute")
def nlp_query(
    request: Request,
    payload: NLQueryRequest,
    ctx: TenantContext = Depends(get_tenant_ctx),
    principal: AuthPrincipal = Depends(require_permission(NLP_QUERY_EXECUTE)),
    db: Session = Depends(get_db),
):
    return _nlp_query_handler(payload, ctx, db, principal=principal)


@nlp_chat_api_router.post("/chat/", response_model=NLQueryResponse, tags=["nlp"], include_in_schema=False)
@nlp_chat_api_router.post("/chat", response_model=NLQueryResponse, tags=["nlp"])
@limiter.limit("20/minute")
def nlp_chat(
    request: Request,
    payload: NLQueryRequest,
    ctx: TenantContext = Depends(get_tenant_ctx),
    principal: AuthPrincipal = Depends(require_permission(NLP_QUERY_EXECUTE)),
    db: Session = Depends(get_db),
):
    """POST /api/chat — AI asistan (role-aware)."""
    return _nlp_query_handler(payload, ctx, db, principal=principal)
