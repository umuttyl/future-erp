"""AI bildirim WebSocket: tenant-aware bağlantı yönetimi + anomali simülasyon döngüsü."""

from __future__ import annotations

import asyncio
import random
import threading
import time
from typing import Any

import structlog
from fastapi import WebSocket
from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.product import Product
from app.models.tenant import Tenant
from app.services.inventory_service import list_ws_anomaly_candidate_products

logger = structlog.get_logger(__name__)

_WS_ANOMALY_COOLDOWN_SEC = 600.0
_ws_anomaly_lock = threading.Lock()
_ws_anomaly_last_sent_by_product: dict[int, float] = {}


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

    async def connect(self, websocket: WebSocket, tenant_id: int, role: str = "") -> None:
        await websocket.accept()
        self._by_tenant.setdefault(tenant_id, []).append(websocket)
        if role == "admin":
            self._admin_sockets.add(websocket)
        logger.info("ws_notification_connected", tenant_id=tenant_id, role=role, active=self.connection_count)

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



def _build_tenant_ws_payload(tenant_id: int) -> dict[str, Any] | None:
    """DB'den verilen tenant'ın ürünlerini seçer; cooldown içindeki ürünleri atlar."""
    db = SessionLocal()
    try:
        pool = list_ws_anomaly_candidate_products(db, tenant_id)
        if not pool:
            return None
        now = time.monotonic()
        with _ws_anomaly_lock:
            eligible = [
                (pid, sku)
                for pid, sku in pool
                if now - _ws_anomaly_last_sent_by_product.get(pid, 0) >= _WS_ANOMALY_COOLDOWN_SEC
            ]
        if not eligible:
            logger.debug("ws_anomaly_skip_cooldown", tenant_id=tenant_id, pool_size=len(pool))
            return None
        product_id, sku = random.choice(eligible)
        with _ws_anomaly_lock:
            _ws_anomaly_last_sent_by_product[product_id] = now

        # Ürün adını da ekle (SKU yanında daha anlamlı mesaj için)
        product_name: str = sku
        try:
            p = db.scalar(select(Product).where(Product.id == product_id))
            if p:
                product_name = p.name
        except Exception:
            pass

        alert_type = random.choice(("warning", "info", "critical"))
        label = "Sipariş Taslağı Oluştur"
        endpoint = f"/api/inventory/{product_id}/auto-draft"
        return {
            "type": alert_type,
            "message": f"AI Uyarısı: {product_name} ({sku}) stokları beklenenden hızlı tükeniyor!",
            "action_label": label,
            "action_endpoint": endpoint,
            "action_type": "inventory.auto_draft",
            "product_id": product_id,
            "product_sku": sku,
            "action": label,
        }
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
        message = f"Platform Özeti: {companies} şirkette {total_critical} kritik stok uyarısı"

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


async def ai_anomaly_simulation_loop() -> None:
    """Her 30–40 sn aktif tenant'lar için anomali mesajı üretir.
    Admin bağlantısı için şirket bazlı değil platform geneli özet gönderilir."""
    while True:
        try:
            await asyncio.sleep(random.uniform(30.0, 40.0))
            active_tids = notification_manager.active_tenant_ids()
            if not active_tids:
                continue
            admin_connected = notification_manager.admin_connected

            # Şirket kullanıcılarına kendi tenant uyarıları (admin soketi hariç)
            for tenant_id in active_tids:
                msg = await asyncio.to_thread(_build_tenant_ws_payload, tenant_id)
                if msg is None:
                    continue
                await notification_manager.broadcast_to_tenant_non_admin(tenant_id, msg)
                logger.debug("ws_anomaly_broadcast", tenant_id=tenant_id)

            # Admin'e platform geneli özet gönder
            if admin_connected:
                summary = await asyncio.to_thread(_build_platform_summary_payload)
                if summary:
                    await notification_manager.broadcast_to_admins(summary)
                    logger.debug("ws_anomaly_platform_summary_sent", companies=summary.get("companies_affected"))
        except asyncio.CancelledError:
            logger.info("ws_anomaly_loop_cancelled")
            raise
        except Exception as exc:
            logger.warning("ws_anomaly_loop_tick_failed", error_type=type(exc).__name__, error=str(exc)[:200])


def spawn_anomaly_simulation_task() -> asyncio.Task[None]:
    return asyncio.create_task(ai_anomaly_simulation_loop(), name="ai_anomaly_ws_broadcast")
