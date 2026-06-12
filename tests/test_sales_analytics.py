"""Sales analytics endpoint tests — P0-4."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.sales import SalesItem, SalesRecord
from app.schemas.sales import DailySalesPoint


def test_daily_sales_analytics_empty(client):
    resp = client.get("/api/sales/analytics/daily")
    assert resp.status_code == 200
    assert resp.json() == []


def test_daily_sales_analytics_uses_service(client):
    """Route must delegate to sales_service.daily_sales_points — no inline SQL."""
    expected = [DailySalesPoint(date=date(2024, 1, 1), quantity=5, revenue=100.0)]
    with patch(
        "app.api.routes.sales.sales_service.daily_sales_points",
        return_value=expected,
    ) as mock_fn:
        resp = client.get("/api/sales/analytics/daily")

    assert resp.status_code == 200
    mock_fn.assert_called_once()
    data = resp.json()
    assert len(data) == 1
    assert data[0]["quantity"] == 5
    assert data[0]["revenue"] == 100.0


def test_daily_sales_analytics_returns_aggregated_data(
    client, db_session: Session, test_tenant
):
    product = Product(
        tenant_id=test_tenant.id,
        sku="SKU-SA1",
        name="Analitik Ürün",
        unit_price=Decimal("50.00"),
        cost_price=Decimal("25.00"),
        stock_quantity=100,
        reorder_level=5,
    )
    db_session.add(product)
    db_session.flush()

    record = SalesRecord(
        tenant_id=test_tenant.id,
        record_no="SR-001",
        sale_date=date(2024, 3, 15),
        customer_name="Test Müşteri",
        total_amount=Decimal("150.00"),
    )
    db_session.add(record)
    db_session.flush()

    item = SalesItem(
        tenant_id=test_tenant.id,
        sales_record_id=record.id,
        product_id=product.id,
        quantity=3,
        unit_price=Decimal("50.00"),
        line_total=Decimal("150.00"),
    )
    db_session.add(item)
    db_session.flush()

    resp = client.get("/api/sales/analytics/daily")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["date"] == "2024-03-15"
    assert data[0]["quantity"] == 3
    assert data[0]["revenue"] == pytest.approx(150.0)


def test_daily_sales_analytics_date_filter(
    client, db_session: Session, test_tenant
):
    product = Product(
        tenant_id=test_tenant.id,
        sku="SKU-SA2",
        name="Filtre Ürün",
        unit_price=Decimal("10.00"),
        cost_price=Decimal("5.00"),
        stock_quantity=100,
        reorder_level=1,
    )
    db_session.add(product)
    db_session.flush()

    for day, rec_no in [(1, "SR-F01"), (15, "SR-F02"), (28, "SR-F03")]:
        rec = SalesRecord(
            tenant_id=test_tenant.id,
            record_no=rec_no,
            sale_date=date(2024, 6, day),
            customer_name="Filtre Müşteri",
            total_amount=Decimal("10.00"),
        )
        db_session.add(rec)
        db_session.flush()
        db_session.add(
            SalesItem(
                tenant_id=test_tenant.id,
                sales_record_id=rec.id,
                product_id=product.id,
                quantity=1,
                unit_price=Decimal("10.00"),
                line_total=Decimal("10.00"),
            )
        )
    db_session.flush()

    resp = client.get(
        "/api/sales/analytics/daily",
        params={"start_date": "2024-06-10", "end_date": "2024-06-20"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["date"] == "2024-06-15"
