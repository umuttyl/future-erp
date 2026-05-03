"""AI bildirim WebSocket: bağlantı yönetimi + anomali simülasyon döngüsü."""

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
from app.models.tenant import Tenant
from app.services.inventory_service import list_ws_anomaly_candidate_products

logger = structlog.get_logger(__name__)

# Aynı ürün için tekrarlı WS spam'ini azaltır (saniye).
_WS_ANOMALY_COOLDOWN_SEC = 600.0
_ws_anomaly_lock = threading.Lock()
_ws_anomaly_last_sent_by_product: dict[int, float] = {}


class ConnectionManager:
    """Aktif WebSocket oturumlarını tutar; JSON yayınlar."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        logger.info("ws_notification_connected", active=self.connection_count)

    def disconnect(self, websocket: WebSocket) -> None:
        try:
            self._connections.remove(websocket)
        except ValueError:
            return
        logger.info("ws_notification_disconnected", active=self.connection_count)

    async def broadcast_json(self, payload: dict[str, Any]) -> None:
        if not self._connections:
            return
        stale: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)


notification_manager = ConnectionManager()


def _build_simulated_ws_payload() -> dict[str, Any] | None:
    """DB'den (varsayılan kiracı) ürün seçer; cooldown içindeki ürünleri atlar."""
    db = SessionLocal()
    try:
        tid = db.scalar(select(Tenant.id).where(Tenant.slug == "default"))
        if tid is None:
            return None
        pool = list_ws_anomaly_candidate_products(db, int(tid))
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
            logger.debug("ws_anomaly_skip_cooldown", pool_size=len(pool))
            return None
        product_id, sku = random.choice(eligible)
        with _ws_anomaly_lock:
            _ws_anomaly_last_sent_by_product[product_id] = now
        alert_type = random.choice(("warning", "info", "critical"))
        label = "Sipariş Taslağı Oluştur"
        endpoint = f"/api/inventory/{product_id}/auto-draft"
        return {
            "type": alert_type,
            "message": f"AI Uyarısı: {sku} stokları beklenenden hızlı tükeniyor!",
            "action_label": label,
            "action_endpoint": endpoint,
            "action_type": "inventory.auto_draft",
            "product_id": product_id,
            "product_sku": sku,
            "action": label,
        }
    finally:
        db.close()


async def ai_anomaly_simulation_loop() -> None:
    """Her 30–40 sn rastgele AI anomali mesajı üretir, tüm istemcilere gönderir (test)."""
    while True:
        try:
            await asyncio.sleep(random.uniform(30.0, 40.0))
            msg = await asyncio.to_thread(_build_simulated_ws_payload)
            if msg is None:
                logger.debug("ws_anomaly_skip_no_payload")
                continue
            await notification_manager.broadcast_json(msg)
            logger.debug("ws_anomaly_broadcast", connections=notification_manager.connection_count)
        except asyncio.CancelledError:
            logger.info("ws_anomaly_loop_cancelled")
            raise
        except Exception as exc:
            logger.warning("ws_anomaly_loop_tick_failed", error_type=type(exc).__name__, error=str(exc)[:200])


def spawn_anomaly_simulation_task() -> asyncio.Task[None]:
    return asyncio.create_task(ai_anomaly_simulation_loop(), name="ai_anomaly_ws_broadcast")
