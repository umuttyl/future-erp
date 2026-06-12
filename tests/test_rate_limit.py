"""Auth endpoint brute-force koruması (slowapi rate limiting).

/auth/login 10/dk ile sınırlı; aşılınca 429 + standart hata zarfı döner.
Bu, kimlik bilgisi deneme saldırılarına (credential stuffing) karşı temel korumadır.
Dağıtık (çok-IP) saldırılar uygulama dışı (WAF/Cloudflare) katmanda ele alınır.
"""

from __future__ import annotations

import pytest

from app.core.rate_limit import limiter


@pytest.fixture(autouse=True)
def _reset_limiter():
    """Her testten önce limiter sayaçlarını sıfırla (modül-singleton state taşınmasın)."""
    try:
        limiter.reset()
    except Exception:
        # Bazı slowapi sürümlerinde reset yoksa storage'ı temizle
        storage = getattr(limiter, "_storage", None)
        if storage is not None and hasattr(storage, "storage"):
            try:
                storage.storage.clear()
            except Exception:
                pass
    yield


def test_login_rate_limited_after_threshold(client_no_auth):
    """11. login denemesinde 429 dönmeli (limit 10/dk)."""
    saw_429 = False
    for _ in range(12):
        r = client_no_auth.post(
            "/api/auth/login",
            json={"tenant_slug": "default", "email": "x@x.com", "password": "wrong"},
        )
        if r.status_code == 429:
            saw_429 = True
            break
    assert saw_429, "11+ denemeden sonra 429 (rate limit) beklenir"


def test_rate_limit_error_envelope(client_no_auth):
    """429 yanıtı standart {error:{code,message}} zarfını kullanmalı."""
    last = None
    for _ in range(12):
        last = client_no_auth.post(
            "/api/auth/login",
            json={"tenant_slug": "default", "email": "x@x.com", "password": "wrong"},
        )
        if last.status_code == 429:
            break
    assert last is not None and last.status_code == 429
    body = last.json()
    assert "error" in body
    assert body["error"]["code"] == "RATE_LIMIT_EXCEEDED"
