"""AI bildirim WebSocket: tenant-aware bağlantı yönetimi + gerçek anomali tespiti."""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any

import structlog
from fastapi import WebSocket
from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.tenant import Tenant
from app.services.anomaly_service import anomaly_result_to_ws_payload, run_all_anomaly_checks
from app.services.inventory_service import list_ws_anomaly_candidate_products
from app.services.notification_service import notification_service

logger = structlog.get_logger(__name__)

_WS_ANOMALY_COOLDOWN_SEC = 600.0
_ws_anomaly_lock = threading.Lock()
# key: (tenant_id, source, entity_id) → last broadcast monotonic time
_ws_anomaly_last_sent: dict[tuple[int, str, int | None], float] = {}

# Minimum interval between full anomaly scans per tenant (2 minutes)
_SCAN_INTERVAL_SEC = 120.0


class ConnectionManager:
    """Aktif WebSocket oturumlarını tenant_id'ye göre tutar."""

    def __init__(self) -> None:
        self._by_tenant: dict[int, list[WebSocket]] = {}
        self._admin_sockets: set[WebSocket] = set()

    @property
    def connection_count(self) -> int:
        return sum(len(lst) for lst in self._by_tenant.values())

    @property
    def admin_connected(self) -> bool:
        return bool(self._admin_sockets)

    def active_tenant_ids(self) -> list[int]:
        return [tid for tid, lst in self._by_tenant.items() if lst]

    async def connect(
        self, websocket: WebSocket, tenant_id: int, *, is_platform_admin: bool = False
    ) -> None:
        await websocket.accept()
        self._by_tenant.setdefault(tenant_id, []).append(websocket)
        if is_platform_admin:
            self._admin_sockets.add(websocket)
        logger.info(
            "ws_notification_connected",
            tenant_id=tenant_id,
            is_platform_admin=is_platform_admin,
            active=self.connection_count,
        )

    def disconnect(self, websocket: WebSocket, tenant_id: int) -> None:
        lst = self._by_tenant.get(tenant_id, [])
        try:
            lst.remove(websocket)
        except ValueError:
            pass
        self._admin_sockets.discard(websocket)
        logger.info("ws_notification_disconnected", tenant_id=tenant_id, active=self.connection_count)

    async def broadcast_to_tenant(self, tenant_id: int, payload: dict[str, Any]) -> None:
        lst = self._by_tenant.get(tenant_id, [])
        if not lst:
            return
        stale: list[WebSocket] = []
        for ws in list(lst):
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            try:
                lst.remove(ws)
            except ValueError:
                pass

    async def broadcast_to_tenant_non_admin(self, tenant_id: int, payload: dict[str, Any]) -> None:
        """Tenant bağlantılarına yayın yapar; admin soketlerini hariç tutar."""
        lst = self._by_tenant.get(tenant_id, [])
        if not lst:
            return
        stale: list[WebSocket] = []
        for ws in list(lst):
            if ws in self._admin_sockets:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            try:
                lst.remove(ws)
            except ValueError:
                pass

    async def broadcast_to_admins(self, payload: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for ws in list(self._admin_sockets):
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self._admin_sockets.discard(ws)

    async def broadcast_all(self, payload: dict[str, Any]) -> None:
        for tid in list(self._by_tenant.keys()):
            await self.broadcast_to_tenant(tid, payload)


notification_manager = ConnectionManager()


def _build_tenant_anomaly_payloads(tenant_id: int) -> list[dict[str, Any]]:
    """Real IsolationForest anomaly detection for a single tenant.

    Returns WS payloads only for anomalies not already broadcast within the cooldown window.
    Returns an empty list when there is insufficient data or no anomalies detected.
    """
    db = SessionLocal()
    try:
        results = run_all_anomaly_checks(db, tenant_id=tenant_id)
        now = time.monotonic()
        payloads: list[dict[str, Any]] = []
        with _ws_anomaly_lock:
            for r in results:
                key = (tenant_id, r.source, r.entity_id)
                if now - _ws_anomaly_last_sent.get(key, 0) < _WS_ANOMALY_COOLDOWN_SEC:
                    continue
                _ws_anomaly_last_sent[key] = now
                payload = anomaly_result_to_ws_payload(r)
                payloads.append(payload)
                try:
                    notification_service.save(
                        db,
                        tenant_id=tenant_id,
                        kind=payload.get("type", "info"),
                        message=payload.get("message", ""),
                        source=payload.get("source", "anomaly"),
                        payload=payload,
                    )
                except Exception:
                    pass
        return payloads
    finally:
        db.close()


def _build_platform_summary_payload() -> dict[str, Any] | None:
    """Tüm tenant'lardaki kritik stok durumunu toplayarak admin'e platform özeti üretir."""
    db = SessionLocal()
    try:
        tenants = db.scalars(select(Tenant)).all()
        total_critical = 0
        tenant_issues: list[dict[str, Any]] = []

        for t in tenants:
            try:
                pool = list_ws_anomaly_candidate_products(db, t.id)
                if pool:
                    count = len(pool)
                    total_critical += count
                    tenant_issues.append({
                        "tenant_id": t.id,
                        "tenant_name": t.name or f"Tenant #{t.id}",
                        "critical_count": count,
                    })
            except Exception:
                continue

        if not tenant_issues:
            return None

        companies = len(tenant_issues)
        severity = "critical" if total_critical >= 5 else "warning" if total_critical > 0 else "info"
        message = f"Platform Summary: {total_critical} critical stock alerts across {companies} {'company' if companies == 1 else 'companies'}"

        return {
            "type": severity,
            "message": message,
            "platform_summary": True,
            "total_critical": total_critical,
            "companies_affected": companies,
            "tenant_issues": tenant_issues[:5],
        }
    finally:
        db.close()


async def ai_anomaly_detection_loop() -> None:
    """Real anomaly detection loop — IsolationForest on sales and inventory data.

    Scans each active tenant at most once every _SCAN_INTERVAL_SEC seconds.
    Only broadcasts when actual anomaly thresholds are crossed; no simulation.
    """
    _last_scan: dict[int, float] = {}

    while True:
        try:
            await asyncio.sleep(30.0)
            active_tids = notification_manager.active_tenant_ids()
            if not active_tids:
                continue

            now = time.monotonic()
            admin_connected = notification_manager.admin_connected

            for tenant_id in active_tids:
                if now - _last_scan.get(tenant_id, 0) < _SCAN_INTERVAL_SEC:
                    continue
                _last_scan[tenant_id] = now

                payloads = await asyncio.to_thread(_build_tenant_anomaly_payloads, tenant_id)
                for payload in payloads:
                    await notification_manager.broadcast_to_tenant_non_admin(tenant_id, payload)
                    logger.debug(
                        "ws_anomaly_broadcast",
                        tenant_id=tenant_id,
                        severity=payload.get("type"),
                        source=payload.get("source"),
                    )

            if admin_connected:
                summary = await asyncio.to_thread(_build_platform_summary_payload)
                if summary:
                    await notification_manager.broadcast_to_admins(summary)
                    logger.debug(
                        "ws_anomaly_platform_summary_sent",
                        companies=summary.get("companies_affected"),
                    )

        except asyncio.CancelledError:
            logger.info("ws_anomaly_loop_cancelled")
            raise
        except Exception as exc:
            logger.warning(
                "ws_anomaly_loop_tick_failed",
                error_type=type(exc).__name__,
                error=str(exc)[:200],
            )


def spawn_anomaly_detection_task() -> asyncio.Task[None]:
    return asyncio.create_task(ai_anomaly_detection_loop(), name="ai_anomaly_ws_broadcast")
