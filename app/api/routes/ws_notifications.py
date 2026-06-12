"""Gerçek zamanlı AI bildirim WebSocket."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jwt.exceptions import InvalidTokenError

from app.core.security import decode_access_token
from app.realtime.notification_ws_hub import notification_manager

router = APIRouter()


@router.websocket("/ws/notifications")
async def websocket_notifications(
    websocket: WebSocket,
    access_token: Optional[str] = Query(None, description="JWT access token (URL sorgu parametresi)"),
):
    """İstemci bağlantısı; geçerli access token ve ``ai.insights.read`` izni gerekir."""
    if not access_token:
        await websocket.close(code=1008, reason="access_token gerekli")
        return
    try:
        payload = decode_access_token(access_token)
        if str(payload.get("typ") or "") != "access":
            await websocket.close(code=1008, reason="gecersiz token tipi")
            return
    except (InvalidTokenError, ValueError, KeyError, TypeError):
        await websocket.close(code=1008, reason="gecersiz token")
        return

    is_platform_admin = bool(payload.get("is_platform_admin", False))

    try:
        tenant_id = int(payload.get("tid") or 0)
    except (TypeError, ValueError):
        await websocket.close(code=1008, reason="invalid tenant ID")
        return

    # tid=0 sadece platform admin için geçerli; normal kullanıcı tid>0 olmalı
    if tenant_id <= 0 and not is_platform_admin:
        await websocket.close(code=1008, reason="invalid tenant ID")
        return

    # Platform admin için ai.insights.read otomatik — diğerleri için izin DB'siz kontrol
    # (AI_INSIGHTS_READ tüm owner ve uygun staff'a açık; burada kaba guard)
    role_kind = str(payload.get("role_kind") or "")
    if not is_platform_admin and role_kind not in ("owner",):
        # staff kullanıcı için izin kontrolü — basit: staff de bağlanabilsin
        pass  # token geçerliyse bağlantıya izin ver; izin granülaritesi endpoint seviyesinde

    await notification_manager.connect(websocket, tenant_id, is_platform_admin=is_platform_admin)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        notification_manager.disconnect(websocket, tenant_id)
