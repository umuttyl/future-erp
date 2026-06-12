"""B: Admin tenant kullanıcı yönetimi — şifre sıfırlama + askıya alma."""

from __future__ import annotations

from app.core.security import verify_password
from app.models.user import User


def test_admin_reset_user_password(client_platform_admin, db_session, test_employee):
    r = client_platform_admin.patch(
        f"/api/admin/users/{test_employee.id}/password",
        json={"new_password": "YeniSifre123"},
    )
    assert r.status_code == 200
    db_session.refresh(test_employee)
    assert verify_password("YeniSifre123", test_employee.password_hash)


def test_admin_reset_password_too_short(client_platform_admin, test_employee):
    r = client_platform_admin.patch(
        f"/api/admin/users/{test_employee.id}/password",
        json={"new_password": "kisa"},
    )
    assert r.status_code == 400


def test_admin_cannot_reset_platform_admin_password(client_platform_admin, test_platform_admin):
    """Admin başka bir platform admin'in şifresini bu uçtan sıfırlayamaz (403)."""
    r = client_platform_admin.patch(
        f"/api/admin/users/{test_platform_admin.id}/password",
        json={"new_password": "YeniSifre123"},
    )
    assert r.status_code == 403


def test_admin_suspend_and_reactivate_user(client_platform_admin, db_session, test_employee):
    # Askıya al
    r = client_platform_admin.patch(
        f"/api/admin/users/{test_employee.id}/status",
        json={"is_active": False},
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is False
    db_session.refresh(test_employee)
    assert test_employee.is_active is False

    # Yeniden aktifleştir
    r2 = client_platform_admin.patch(
        f"/api/admin/users/{test_employee.id}/status",
        json={"is_active": True},
    )
    assert r2.status_code == 200
    assert r2.json()["is_active"] is True


def test_admin_cannot_suspend_platform_admin(client_platform_admin, test_platform_admin):
    r = client_platform_admin.patch(
        f"/api/admin/users/{test_platform_admin.id}/status",
        json={"is_active": False},
    )
    assert r.status_code == 403


def test_non_admin_cannot_reset_passwords(client, test_employee):
    """Tenant owner (admin değil) bu uca erişemez."""
    r = client.patch(
        f"/api/admin/users/{test_employee.id}/password",
        json={"new_password": "YeniSifre123"},
    )
    assert r.status_code == 403
