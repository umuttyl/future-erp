from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import ValidationException
from app.core.permissions import NLP_QUERY_EXECUTE
from app.services.nlp_assistant import UnsafeSQL, run_nlp_query

router = APIRouter()


class NLQueryRequest(BaseModel):
    text: str = Field(min_length=3, max_length=500)


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


@router.post("/query", response_model=NLQueryResponse)
def nlp_query(
    payload: NLQueryRequest,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(NLP_QUERY_EXECUTE)),
    db: Session = Depends(get_db),
):
    try:
        result = run_nlp_query(db, user_text=payload.text, tenant_id=ctx.tenant_id)
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
    except UnsafeSQL as e:
        raise ValidationException(str(e), code="NLP_UNSAFE_SQL") from e
