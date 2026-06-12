"""Anomali tespiti endpoint'leri.

GET /api/anomaly/run     → Tüm analizleri şimdi çalıştır, sonuçları döner + WS'e yayınlar
GET /api/anomaly/latest  → Son çalıştırma sonuçlarını in-memory'den döner
"""
from __future__ import annotations

import asyncio
from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx, require_permission
from app.core.permissions import AI_INSIGHTS_READ
from app.services.anomaly_service import (
    AnomalyResult,
    anomaly_result_to_ws_payload,
    run_all_anomaly_checks,
)

logger = structlog.get_logger(__name__)
router = APIRouter()

# Son çalıştırma sonuçları (in-memory cache, tenant_id → list)
_latest_results: dict[int, list[AnomalyResult]] = {}


class AnomalyResultOut(BaseModel):
    source: str
    severity: str
    title: str
    message: str
    score: float
    entity_id: int | None = None
    entity_label: str | None = None
    extra: dict[str, Any] = {}


class AnomalyRunResponse(BaseModel):
    tenant_id: int
    total: int
    anomalies: list[AnomalyResultOut]


@router.get("/run", response_model=AnomalyRunResponse)
async def run_anomaly_detection(
    _principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
) -> AnomalyRunResponse:
    """Tüm anomali tespitlerini çalıştırır ve WS üzerinden yayınlar."""
    results = run_all_anomaly_checks(db, tenant_id=ctx.tenant_id)
    _latest_results[ctx.tenant_id] = results

    if results:
        try:
            from app.realtime.notification_ws_hub import (  # noqa: PLC0415
                _get_tenant_name,
                notification_manager,
            )
            tenant_name = await asyncio.to_thread(_get_tenant_name, ctx.tenant_id)
            for result in results:
                if result.severity in ("critical", "warning"):
                    payload = anomaly_result_to_ws_payload(result)
                    await notification_manager.broadcast_to_tenant(ctx.tenant_id, payload)
                    if notification_manager.admin_connected:
                        admin_payload = {
                            **payload,
                            "message": f"[{tenant_name}] {payload.get('message', '')}",
                            "cross_tenant": True,
                            "source_tenant_id": ctx.tenant_id,
                        }
                        await notification_manager.broadcast_to_admins(admin_payload)
        except Exception as exc:
            logger.warning("anomaly_ws_broadcast_failed", error=str(exc)[:200])

    return AnomalyRunResponse(
        tenant_id=ctx.tenant_id,
        total=len(results),
        anomalies=[
            AnomalyResultOut(
                source=r.source,
                severity=r.severity,
                title=r.title,
                message=r.message,
                score=r.score,
                entity_id=r.entity_id,
                entity_label=r.entity_label,
                extra=r.extra,
            )
            for r in results
        ],
    )


@router.get("/latest", response_model=AnomalyRunResponse)
def get_latest_anomalies(
    _principal: Annotated[AuthPrincipal, Depends(require_permission(AI_INSIGHTS_READ))],
    ctx: TenantContext = Depends(get_tenant_ctx),
) -> AnomalyRunResponse:
    """Son çalıştırma sonuçlarını döner (DB sorgusu yapmaz)."""
    results = _latest_results.get(ctx.tenant_id, [])
    return AnomalyRunResponse(
        tenant_id=ctx.tenant_id,
        total=len(results),
        anomalies=[
            AnomalyResultOut(
                source=r.source,
                severity=r.severity,
                title=r.title,
                message=r.message,
                score=r.score,
                entity_id=r.entity_id,
                entity_label=r.entity_label,
                extra=r.extra,
            )
            for r in results
        ],
    )
