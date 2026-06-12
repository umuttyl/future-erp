"""Inventory / Actionable AI taslak tedarik endpointleri."""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.sales_forecast_result import SalesForecastResult
from app.models.supply_order import SupplyOrder


def _product(db_session: Session, tenant_id: int, **kwargs) -> Product:
    defaults = dict(
        tenant_id=tenant_id,
        sku="SKU-INV",
        name="Inv Test",
        category=None,
        unit_price=Decimal("10.00"),
        cost_price=Decimal("5.00"),
        stock_quantity=10,
        reorder_level=20,
    )
    defaults.update(kwargs)
    p = Product(**defaults)
    db_session.add(p)
    db_session.flush()
    return p


def test_auto_draft_rejects_when_stock_not_critical(client, db_session: Session, test_tenant):
    p = _product(db_session, test_tenant.id, stock_quantity=100, reorder_level=5)
    db_session.commit()

    resp = client.post(f"/api/inventory/{p.id}/auto-draft")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "STOCK_NOT_CRITICAL"


def test_auto_draft_ai_override_bypasses_critical(client, db_session: Session, test_tenant):
    p = _product(db_session, test_tenant.id, stock_quantity=500, reorder_level=10)
    db_session.commit()

    resp = client.post(f"/api/inventory/{p.id}/auto-draft", params={"is_ai_override": True})
    assert resp.status_code == 201
    body = resp.json()
    assert body["order"]["product_id"] == p.id
    assert body["order"]["quantity"] >= 50


def test_auto_draft_creates_supply_order_target_gap(client, db_session: Session, test_tenant):
    p = _product(db_session, test_tenant.id, stock_quantity=10, reorder_level=20)
    db_session.commit()

    resp = client.post(f"/api/inventory/{p.id}/auto-draft")
    assert resp.status_code == 201
    body = resp.json()
    assert body["message"]
    assert body["order"]["product_id"] == p.id
    assert body["order"]["status"] == "Draft"
    assert body["order"]["quantity"] == 90  # 100 - 10
    assert body["stock_before"] == 10
    assert body["critical_threshold_used"] == 20
    assert body["quantity_from_target_gap"] == 90
    assert body["prophet_demand_sum_30d"] is None

    row = db_session.get(SupplyOrder, body["order"]["id"])
    assert row is not None
    assert row.tenant_id == test_tenant.id
    assert row.quantity == 90


def test_auto_draft_uses_prophet_when_present(client, db_session: Session, test_tenant):
    p = _product(db_session, test_tenant.id, sku="SKU-P", stock_quantity=10, reorder_level=20)
    daily = [{"date": f"2026-01-{i+1:02d}", "quantity": 5.0} for i in range(30)]
    db_session.add(
        SalesForecastResult(
            tenant_id=test_tenant.id,
            model_name="prophet",
            scope="product",
            product_id=p.id,
            forecast_start=date(2026, 1, 1),
            horizon_days=30,
            result_payload={"daily": daily},
        )
    )
    db_session.commit()

    resp = client.post(f"/api/inventory/{p.id}/auto-draft")
    assert resp.status_code == 201
    body = resp.json()
    assert body["prophet_demand_sum_30d"] == 150  # 30 * 5
    assert body["order"]["quantity"] == 140  # max(90, 150-10)


def test_auto_draft_not_found(client, db_session: Session, test_tenant):
    db_session.commit()
    resp = client.post("/api/inventory/999999/auto-draft")
    assert resp.status_code == 404


def test_auto_draft_forbidden_for_employee(client_employee, db_session: Session, test_tenant):
    p = _product(db_session, test_tenant.id, stock_quantity=5, reorder_level=20)
    db_session.commit()
    resp = client_employee.post(f"/api/inventory/{p.id}/auto-draft")
    assert resp.status_code == 403
