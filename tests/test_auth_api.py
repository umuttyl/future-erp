"""Kimlik ve yetki uçları."""

import uuid


def test_me_unauthorized(client_no_auth):
    r = client_no_auth.get("/api/auth/me")
    assert r.status_code == 401


def test_me_as_admin(client, test_admin):
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == test_admin.email
    assert data["role"] == "admin"
    assert data.get("full_name") == "Test Admin"
    assert "admin.access" in data["permissions"]


def test_signup_then_login(client_no_auth):
    suf = uuid.uuid4().hex[:10]
    org = f"Test Org {suf}"
    email = f"owner{suf}@example.com"
    r = client_no_auth.post(
        "/api/auth/signup",
        json={
            "organization_name": org,
            "email": email,
            "password": "Secret123",
            "full_name": "Owner User",
            "department": "HQ",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body.get("access_token")
    slug = body["tenant_slug"]
    r2 = client_no_auth.post(
        "/api/auth/login",
        json={"tenant_slug": slug, "email": email, "password": "Secret123"},
    )
    assert r2.status_code == 200, r2.text


def test_employee_forbidden_create_product(client_employee):
    r = client_employee.post(
        "/api/products",
        json={
            "sku": "NEW-SKU",
            "name": "Yeni",
            "unit_price": 10,
            "cost_price": 5,
            "stock_quantity": 0,
            "reorder_level": 0,
        },
    )
    assert r.status_code == 403
