"""P1-2: TenantScopedService base class tests."""

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.tenant import Tenant
from app.services.products_service import products_service


@pytest.fixture
def two_tenants(db_session: Session):
    t1 = Tenant(name="Tenant A", slug="tenant-a-iso")
    t2 = Tenant(name="Tenant B", slug="tenant-b-iso")
    db_session.add_all([t1, t2])
    db_session.flush()
    return t1, t2


def _product(tenant_id: int, sku: str, name: str) -> Product:
    return Product(
        tenant_id=tenant_id,
        sku=sku,
        name=name,
        unit_price=Decimal("10.00"),
        cost_price=Decimal("5.00"),
        stock_quantity=10,
        reorder_level=2,
    )


def test_tenant_scoped_filters_other_tenant(db_session: Session, two_tenants):
    """products_service.list başka tenant ürününü dönemez."""
    t1, t2 = two_tenants
    p1 = _product(t1.id, "T1-001", "Tenant A Ürünü")
    p2 = _product(t2.id, "T2-001", "Tenant B Ürünü")
    db_session.add_all([p1, p2])
    db_session.flush()

    rows = products_service.list(db_session, t1.id)
    assert all(r.tenant_id == t1.id for r in rows)
    assert p2 not in rows


def test_tenant_scoped_get_one_isolates(db_session: Session, two_tenants):
    """_get_one başka tenantın kaydını dönemez."""
    t1, t2 = two_tenants
    p2 = _product(t2.id, "T2-002", "Sadece B")
    db_session.add(p2)
    db_session.flush()

    # t1 ile t2'nin ürününü sorgula → None dönmeli
    result = products_service.get(db_session, t1.id, p2.id)
    assert result is None


def test_tenant_scoped_service_base_scoped_method():
    """_scoped() metodu TenantScopedService'den gelmelidir."""
    from app.services._base import TenantScopedService
    assert issubclass(type(products_service), TenantScopedService)
    assert hasattr(products_service, "_scoped")
    assert hasattr(products_service, "_get_one")


def test_tenant_scoped_get_returns_own_tenant_row(db_session: Session, two_tenants):
    """_get_one kendi tenant'ının kaydını döner."""
    t1, _ = two_tenants
    p1 = _product(t1.id, "T1-003", "A'nın Ürünü")
    db_session.add(p1)
    db_session.flush()

    result = products_service.get(db_session, t1.id, p1.id)
    assert result is not None
    assert result.id == p1.id
    assert result.tenant_id == t1.id
