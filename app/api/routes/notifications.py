from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_current_principal, get_tenant_ctx
from app.services.notification_service import notification_service

router = APIRouter()


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    message: str
    source: str
    payload_json: str | None = None
    read_at: datetime | None = None
    created_at: datetime

    @property
    def payload(self) -> dict | None:
        if not self.payload_json:
            return None
        try:
            return json.loads(self.payload_json)
        except Exception:
            return None


class BulkActionOut(BaseModel):
    affected: int


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    _: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return notification_service.list_for_tenant(db, tenant_id=ctx.tenant_id)


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    notification_id: int,
    _: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    notification_service.mark_read(db, notification_id=notification_id, tenant_id=ctx.tenant_id)
    return None


@router.patch("/read-all", response_model=BulkActionOut)
def mark_all_read(
    _: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    affected = notification_service.mark_all_read(db, tenant_id=ctx.tenant_id)
    return BulkActionOut(affected=affected)


@router.delete("/read", response_model=BulkActionOut)
def delete_read(
    _: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    affected = notification_service.delete_read(db, tenant_id=ctx.tenant_id)
    return BulkActionOut(affected=affected)
