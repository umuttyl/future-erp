"""P1-1: Refresh token HttpOnly cookie tests."""

import uuid


def _login(client, tenant, admin):
    resp = client.post(
        "/api/auth/login",
        json={"tenant_slug": tenant.slug, "email": admin.email, "password": "Secret123"},
    )
    assert resp.status_code == 200, resp.text
    return resp


def test_login_sets_httponly_refresh_cookie(client_no_auth, test_tenant, test_admin):
    resp = _login(client_no_auth, test_tenant, test_admin)
    assert "future_erp_refresh" in resp.cookies
    set_cookie = resp.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie
    assert "samesite=lax" in set_cookie.lower()


def test_signup_sets_refresh_cookie(client_no_auth):
    """Tek signup çağrısı — cookie testi için."""
    suf = uuid.uuid4().hex[:10]
    resp = client_no_auth.post(
        "/api/auth/signup",
        json={
            "organization_name": f"Cookie Org {suf}",
            "email": f"owner{suf}@example.com",
            "password": "Secret123",
            "full_name": "Cookie Owner",
            "department": "IT",
        },
    )
    assert resp.status_code == 201, resp.text
    assert "future_erp_refresh" in resp.cookies
    set_cookie = resp.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie


def test_refresh_via_cookie(client_no_auth, test_tenant, test_admin):
    """Cookie otomatik gönderilince body olmadan refresh çalışmalı."""
    resp = _login(client_no_auth, test_tenant, test_admin)
    assert "future_erp_refresh" in resp.cookies

    # Cookie TestClient tarafından otomatik gönderilir; body yok
    r2 = client_no_auth.post("/api/auth/refresh")
    assert r2.status_code == 200
    body = r2.json()
    assert body.get("access_token")
    # Yeni cookie set edilmiş olmalı
    assert "future_erp_refresh" in r2.cookies


def test_refresh_no_cookie_no_body_returns_401(client_no_auth):
    """Cookie ve body yoksa 401 dönmeli."""
    # Önce cookie'yi temizle (TestClient sıfırdan başlar)
    r = client_no_auth.post("/api/auth/refresh")
    assert r.status_code == 401


def test_refresh_via_body_still_works(client_no_auth, test_tenant, test_admin):
    """Geriye uyumluluk: body ile refresh_token göndermek hâlâ çalışmalı."""
    resp = client_no_auth.post(
        "/api/auth/login",
        json={"tenant_slug": test_tenant.slug, "email": test_admin.email, "password": "Secret123"},
    )
    assert resp.status_code == 200
    refresh_token = resp.json().get("refresh_token")
    assert refresh_token

    # Yeni istek öncesi cookie sil — body ile fallback test edilir
    client_no_auth.cookies.clear()
    r2 = client_no_auth.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert r2.status_code == 200
    assert r2.json().get("access_token")


def test_logout_deletes_cookie(client_no_auth, test_tenant, test_admin):
    resp = client_no_auth.post(
        "/api/auth/login",
        json={"tenant_slug": test_tenant.slug, "email": test_admin.email, "password": "Secret123"},
    )
    assert resp.status_code == 200
    assert "future_erp_refresh" in resp.cookies

    r_logout = client_no_auth.post("/api/auth/logout")
    assert r_logout.status_code == 204
    # Cookie silinmiş (max-age=0 veya expires geçmiş)
    set_cookie = r_logout.headers.get("set-cookie", "")
    assert "future_erp_refresh" in set_cookie
    assert "max-age=0" in set_cookie.lower() or "expires=" in set_cookie.lower()
