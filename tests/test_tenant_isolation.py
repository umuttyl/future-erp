"""P1-8: Çapraz-tenant veri sızıntısı testleri.

Her tenant-scoped list endpoint için: tenant A başka tenant'ın verisini göremez.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.customer import Customer
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.supply_order import SupplyOrder
from app.models.tenant import Tenant
from app.models.user import User


@pytest.fixture
def two_tenants_with_data(db_session: Session):
    """İki tenant + her biri için ürün/müşteri/tedarikçi/sipariş."""
    t1 = Tenant(name="Tenant Alpha", slug="t-alpha")
    t2 = Tenant(name="Tenant Beta", slug="t-beta")
    db_session.add_all([t1, t2])
    db_session.flush()

    u1 = User(
        tenant_id=t1.id,
        email="alpha@test.com",
        password_hash=hash_password("X"),
        full_name="Alpha Admin",
        role="admin",
        is_active=True,
    )
    u2 = User(
        tenant_id=t2.id,
        email="beta@test.com",
        password_hash=hash_password("X"),
        full_name="Beta Admin",
        role="admin",
        is_active=True,
    )
    db_session.add_all([u1, u2])
    db_session.flush()

    p1 = Product(tenant_id=t1.id, sku="T1-PROD", name="Alpha Ürün", unit_price=Decimal("10"))
    p2 = Product(tenant_id=t2.id, sku="T2-PROD", name="Beta Ürün", unit_price=Decimal("10"))
    c1 = Customer(tenant_id=t1.id, name="Alpha Müşteri", email="c@alpha.com")
    c2 = Customer(tenant_id=t2.id, name="Beta Müşteri", email="c@beta.com")
    s1 = Supplier(tenant_id=t1.id, name="Alpha Tedarikçi", email="s@alpha.com")
    s2 = Supplier(tenant_id=t2.id, name="Beta Tedarikçi", email="s@beta.com")
    db_session.add_all([p1, p2, c1, c2, s1, s2])
    db_session.flush()

    so1 = SupplyOrder(tenant_id=t1.id, product_id=p1.id, quantity=5, status="draft")
    so2 = SupplyOrder(tenant_id=t2.id, product_id=p2.id, quantity=5, status="draft")
    db_session.add_all([so1, so2])
    db_session.flush()

    return t1, t2, u1, u2, p1, p2, c1, c2, s1, s2, so1, so2


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------


def test_products_returns_only_own_tenant(client_for, two_tenants_with_data):
    t1, t2, u1, u2, p1, p2, *_ = two_tenants_with_data
    resp = client_for(u1).get("/api/products")
    assert resp.status_code == 200
    skus = [r["sku"] for r in resp.json()]
    assert p1.sku in skus
    assert p2.sku not in skus


def test_products_other_tenant_cannot_read_item(client_for, two_tenants_with_data):
    t1, t2, u1, u2, p1, p2, *_ = two_tenants_with_data
    resp = client_for(u2).get(f"/api/products/{p1.id}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------


def test_customers_returns_only_own_tenant(client_for, two_tenants_with_data):
    t1, t2, u1, u2, p1, p2, c1, c2, *_ = two_tenants_with_data
    resp = client_for(u1).get("/api/customers")
    assert resp.status_code == 200
    data = resp.json()
    ids = [r["id"] for r in data]
    assert c1.id in ids
    assert c2.id not in ids
    for row in data:
        assert row["tenant_id"] == t1.id


def test_customers_other_tenant_cannot_read_item(client_for, two_tenants_with_data):
    t1, t2, u1, u2, p1, p2, c1, c2, *_ = two_tenants_with_data
    resp = client_for(u2).get(f"/api/customers/{c1.id}")
    assert resp.status_code in (403, 404)


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------


def test_suppliers_returns_only_own_tenant(client_for, two_tenants_with_data):
    t1, t2, u1, u2, p1, p2, c1, c2, s1, s2, *_ = two_tenants_with_data
    resp = client_for(u1).get("/api/suppliers")
    assert resp.status_code == 200
    data = resp.json()
    ids = [r["id"] for r in data]
    assert s1.id in ids
    assert s2.id not in ids
    for row in data:
        assert row["tenant_id"] == t1.id


def test_suppliers_other_tenant_cannot_read_item(client_for, two_tenants_with_data):
    t1, t2, u1, u2, p1, p2, c1, c2, s1, s2, *_ = two_tenants_with_data
    resp = client_for(u2).get(f"/api/suppliers/{s1.id}")
    assert resp.status_code in (403, 404)


# ---------------------------------------------------------------------------
# Inventory orders
# ---------------------------------------------------------------------------


def test_inventory_orders_returns_only_own_tenant(client_for, two_tenants_with_data):
    *_, so1, so2 = two_tenants_with_data
    t1, t2, u1, u2 = two_tenants_with_data[:4]
    resp = client_for(u1).get("/api/inventory/orders")
    assert resp.status_code == 200
    order_ids = [r["id"] for r in resp.json()]
    assert so1.id in order_ids
    assert so2.id not in order_ids


# ---------------------------------------------------------------------------
# Sales records
# ---------------------------------------------------------------------------


def test_sales_records_returns_only_own_tenant(client_for, two_tenants_with_data):
    t1, t2, u1, u2, *_ = two_tenants_with_data
    resp = client_for(u1).get("/api/sales/records")
    assert resp.status_code == 200
    for row in resp.json():
        assert row["tenant_id"] == t1.id
