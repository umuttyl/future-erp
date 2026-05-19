"""WebSocket bildirim endpoint'i testleri (ACTION_PLAN P0-1)."""

from __future__ import annotations

from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.config import settings
from app.core.db import get_db
from app.core.security import create_access_token, decode_access_token
from app.main import create_app
from app.models.tenant import Tenant
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_app(db_session: Session) -> TestClient:
    application = create_app()

    def _override_db() -> Generator[Session, None, None]:
        yield db_session

    application.dependency_overrides[get_db] = _override_db
    return TestClient(application, raise_server_exceptions=False)


def _build_token(payload_overrides: dict) -> str:
    """JWT_SECRET ile imzalanmış özel payload token'ı üretir."""
    now = datetime.now(timezone.utc)
    base = {
        "sub": "1",
        "tid": 1,
        "role": "admin",
        "email": "test@example.com",
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=30)).timestamp()),
    }
    base.update(payload_overrides)
    return jwt.encode(base, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ---------------------------------------------------------------------------
# Birim: JWT payload 'tid' anahtarını doğrula
# ---------------------------------------------------------------------------


def test_jwt_payload_uses_tid_not_tenant_id(test_tenant: Tenant, test_admin: User):
    """JWT access token 'tid' içermeli; 'tenant_id' İÇERMEMELİ (eski yanlış anahtar)."""
    token = create_access_token(
        user_id=test_admin.id,
        tenant_id=test_tenant.id,
        role="admin",
        email=test_admin.email,
    )
    payload = decode_access_token(token)
    assert payload["tid"] == test_tenant.id, "JWT 'tid' claim test_tenant.id'ye eşit olmalı"
    assert "tenant_id" not in payload, "JWT 'tenant_id' claim içermemeli (bu anahtar WS bug'ına neden oluyordu)"


# ---------------------------------------------------------------------------
# WebSocket: geçerli token → bağlantı kabul
# ---------------------------------------------------------------------------


def test_ws_accepts_valid_admin_token(db_session: Session, test_tenant: Tenant, test_admin: User):
    """Geçerli access token + admin rolü → WS bağlantısı kurulmalı."""
    token = create_access_token(
        user_id=test_admin.id,
        tenant_id=test_tenant.id,
        role="admin",
        email=test_admin.email,
    )
    client = _make_app(db_session)
    with client:
        with client.websocket_connect(f"/api/ws/notifications?access_token={token}"):
            pass  # Bağlantı başarılıysa test geçer


# ---------------------------------------------------------------------------
# WebSocket: hatalı token senaryoları → 1008 ile reddet
# ---------------------------------------------------------------------------


def test_ws_rejects_missing_token():
    """access_token parametresi gönderilmemiş → WS bağlantısı reddedilmeli."""
    client = TestClient(create_app(), raise_server_exceptions=False)
    with client:
        with pytest.raises(Exception):
            with client.websocket_connect("/api/ws/notifications"):
                pass


def test_ws_rejects_token_with_zero_tenant_id(db_session: Session):
    """tid=0 (sıfır) içeren token → geçersiz tenant; 1008 ile kapatılmalı."""
    token = _build_token({"tid": 0})
    client = _make_app(db_session)
    with client:
        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/ws/notifications?access_token={token}"):
                pass


def test_ws_rejects_token_with_negative_tenant_id(db_session: Session):
    """tid=-1 (negatif) içeren token → geçersiz tenant; 1008 ile kapatılmalı."""
    token = _build_token({"tid": -1})
    client = _make_app(db_session)
    with client:
        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/ws/notifications?access_token={token}"):
                pass


def test_ws_rejects_wrong_token_type(db_session: Session):
    """typ='refresh' olan token → yanlış token tipi; 1008 ile kapatılmalı."""
    token = _build_token({"typ": "refresh"})
    client = _make_app(db_session)
    with client:
        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/ws/notifications?access_token={token}"):
                pass


def test_ws_rejects_unknown_role(db_session: Session):
    """Bilinmeyen rol → AI_INSIGHTS_READ izni yok → 1008 ile kapatılmalı."""
    token = _build_token({"role": "unknown_role", "tid": 1})
    client = _make_app(db_session)
    with client:
        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/ws/notifications?access_token={token}"):
                pass
