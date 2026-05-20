"""Gerçek zamanlı AI bildirim WebSocket."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jwt.exceptions import InvalidTokenError

from app.core.permissions import AI_INSIGHTS_READ, role_has_permission
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
        role = str(payload.get("role") or "")
        if not role_has_permission(role, AI_INSIGHTS_READ):
            await websocket.close(code=1008, reason="yetkisiz")
            return
    except (InvalidTokenError, ValueError, KeyError, TypeError):
        await websocket.close(code=1008, reason="gecersiz token")
        return

    tid_raw = payload.get("tid")
    if tid_raw is None:
        await websocket.close(code=1008, reason="tenant kimliği yok")
        return
    try:
        tenant_id = int(tid_raw)
        if tenant_id <= 0:
            raise ValueError
    except (TypeError, ValueError):
        await websocket.close(code=1008, reason="geçersiz tenant kimliği")
        return

    await notification_manager.connect(websocket, tenant_id, role=role)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        notification_manager.disconnect(websocket, tenant_id)
