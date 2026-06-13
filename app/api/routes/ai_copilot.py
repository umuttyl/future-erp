"""AI Co-pilot endpoint — Claude tool_use agentic loop with SSE streaming."""
from __future__ import annotations

from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx_or_admin, require_permission
from app.core.permissions import NLP_QUERY_EXECUTE
from app.models.tenant import Tenant
from app.services.ai_copilot_service import ToolContext, run_copilot_stream

router = APIRouter()


class HistoryMessage(BaseModel):
    role: str   # "user" or "assistant"
    text: str


class CopilotChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    context: Optional[str] = Field(default=None, max_length=200)
    history: List[HistoryMessage] = Field(default_factory=list, max_length=12)


@router.post("/chat")
def copilot_chat(
    body: CopilotChatIn,
    principal: Annotated[AuthPrincipal, Depends(require_permission(NLP_QUERY_EXECUTE))],
    ctx: TenantContext = Depends(get_tenant_ctx_or_admin),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """SSE stream: tool execution status → answer tokens → final payload."""
    tenant = db.get(Tenant, ctx.tenant_id)
    tenant_name = (tenant.name or "") if tenant else ""

    tool_ctx = ToolContext(
        db=db,
        tenant_id=ctx.tenant_id,
        user_role=principal.role,
        tenant_name=tenant_name,
    )

    history = [{"role": m.role, "text": m.text} for m in body.history]

    return StreamingResponse(
        run_copilot_stream(
            user_text=body.text,
            ctx=tool_ctx,
            page_context=body.context or "",
            history=history,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
