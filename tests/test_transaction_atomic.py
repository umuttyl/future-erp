"""P1-6: Transaction sınırı testleri.

Her iki servis metodu da tek db.commit() kullanmalı (atomik işlem).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.sales import SalesRecord
from app.models.stock_movement import StockMovement
from app.models.tenant import Tenant
from app.schemas.product import ProductCreate
from app.schemas.sales import SalesItemCreate, SalesRecordCreate
from app.services.products_service import products_service
from app.services.sales_service import sales_service


def _make_product(db: Session, tenant_id: int, sku: str, stock: int = 20) -> Product:
    p = Product(
        tenant_id=tenant_id,
        sku=sku,
        name=f"Ürün {sku}",
        stock_quantity=stock,
        unit_price=Decimal("50.00"),
        cost_price=Decimal("30.00"),
        reorder_level=5,
    )
    db.add(p)
    db.flush()
    return p


# ---------------------------------------------------------------------------
# products_service.create — tek commit
# ---------------------------------------------------------------------------


def test_products_create_single_commit(db_session: Session, test_tenant: Tenant, monkeypatch):
    """products_service.create tam olarak bir kez commit çağırmalı."""
    commit_calls = []
    original_commit = db_session.commit

    def _counting_commit():
        commit_calls.append(1)
        original_commit()

    monkeypatch.setattr(db_session, "commit", _counting_commit)

    data = ProductCreate(
        sku="SKU-COMMIT-1",
        name="Atomik Ürün",
        stock_quantity=10,
        unit_price=Decimal("99.00"),
        cost_price=Decimal("60.00"),
        reorder_level=3,
    )
    products_service.create(db_session, test_tenant.id, data)

    assert len(commit_calls) == 1, f"Beklenen 1 commit, gerçekleşen: {len(commit_calls)}"


def test_products_create_with_zero_stock_single_commit(
    db_session: Session, test_tenant: Tenant, monkeypatch
):
    """Başlangıç stoğu 0 olunca da tek commit yeterli."""
    commit_calls = []
    original_commit = db_session.commit

    def _counting_commit():
        commit_calls.append(1)
        original_commit()

    monkeypatch.setattr(db_session, "commit", _counting_commit)

    data = ProductCreate(
        sku="SKU-COMMIT-0",
        name="Sıfır Stoklu Ürün",
        stock_quantity=0,
        unit_price=Decimal("10.00"),
        cost_price=Decimal("5.00"),
        reorder_level=0,
    )
    products_service.create(db_session, test_tenant.id, data)

    assert len(commit_calls) == 1


def test_products_create_creates_stock_movement_atomically(
    db_session: Session, test_tenant: Tenant
):
    """Ürün ve başlangıç stok hareketi aynı commit'te oluşturulmalı."""
    data = ProductCreate(
        sku="SKU-ATOMIC-PROD",
        name="Atomik Ürün 2",
        stock_quantity=15,
        unit_price=Decimal("20.00"),
        cost_price=Decimal("12.00"),
        reorder_level=2,
    )
    product = products_service.create(db_session, test_tenant.id, data)

    movements = (
        db_session.query(StockMovement)
        .filter_by(product_id=product.id, tenant_id=test_tenant.id)
        .all()
    )
    assert len(movements) == 1
    assert movements[0].change == 15
    assert movements[0].movement_type == "in"


# ---------------------------------------------------------------------------
# sales_service.create_record — tek commit
# ---------------------------------------------------------------------------


def test_sales_create_record_single_commit(db_session: Session, test_tenant: Tenant, monkeypatch):
    """sales_service.create_record tam olarak bir kez commit çağırmalı."""
    product = _make_product(db_session, test_tenant.id, "SKU-SALE-COMMIT")

    commit_calls = []
    original_commit = db_session.commit

    def _counting_commit():
        commit_calls.append(1)
        original_commit()

    monkeypatch.setattr(db_session, "commit", _counting_commit)

    data = SalesRecordCreate(
        record_no="REC-ATOMIC-001",
        sale_date=date.today(),
        customer_name="Test Müşteri",
        items=[SalesItemCreate(product_id=product.id, quantity=2, unit_price=Decimal("50.00"))],
    )
    sales_service.create_record(db_session, test_tenant.id, data)

    assert len(commit_calls) == 1, f"Beklenen 1 commit, gerçekleşen: {len(commit_calls)}"


def test_sales_create_record_stock_movement_atomically(
    db_session: Session, test_tenant: Tenant
):
    """SalesRecord ve StockMovement aynı işlemde oluşturulmalı."""
    product = _make_product(db_session, test_tenant.id, "SKU-SALE-ATOMIC", stock=10)

    data = SalesRecordCreate(
        record_no="REC-ATOMIC-002",
        sale_date=date.today(),
        customer_name="Test Müşteri 2",
        items=[SalesItemCreate(product_id=product.id, quantity=3, unit_price=Decimal("50.00"))],
    )
    record = sales_service.create_record(db_session, test_tenant.id, data)

    assert record.id is not None
    movements = (
        db_session.query(StockMovement)
        .filter_by(product_id=product.id, tenant_id=test_tenant.id, movement_type="out")
        .all()
    )
    assert len(movements) == 1
    assert movements[0].change == -3

    db_session.refresh(product)
    assert product.stock_quantity == 7
