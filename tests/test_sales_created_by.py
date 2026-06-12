"""Tests for SalesRecord.created_by_user_id (ACTION_PLAN 2A-5)."""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models.sales import SalesRecord


class TestSalesRecordCreatedBy:
    def test_column_exists(self):
        cols = {c.key for c in SalesRecord.__table__.columns}
        assert "created_by_user_id" in cols

    def test_column_nullable(self):
        col = SalesRecord.__table__.c["created_by_user_id"]
        assert col.nullable is True

    def test_old_records_null(self, db_session: Session, test_tenant):
        rec = SalesRecord(
            tenant_id=test_tenant.id,
            record_no=f"OLD-{uuid.uuid4().hex[:6]}",
            sale_date=date.today(),
            total_amount=0,
        )
        db_session.add(rec)
        db_session.flush()
        assert rec.created_by_user_id is None

    def test_new_record_stores_user(self, db_session: Session, test_tenant, test_admin):
        rec = SalesRecord(
            tenant_id=test_tenant.id,
            record_no=f"NEW-{uuid.uuid4().hex[:6]}",
            sale_date=date.today(),
            total_amount=0,
            created_by_user_id=test_admin.id,
        )
        db_session.add(rec)
        db_session.flush()
        assert rec.created_by_user_id == test_admin.id


class TestCreateRecordEndpointSetsUser:
    """POST /api/sales/records must set created_by_user_id from principal."""

    def _make_payload(self, product_id: int) -> dict:
        return {
            "record_no": f"S-{uuid.uuid4().hex[:6]}",
            "sale_date": str(date.today()),
            "items": [{"product_id": product_id, "quantity": 1, "unit_price": "10.00"}],
        }

    def test_created_by_set_on_create(self, client, db_session: Session, test_admin, test_tenant):
        from sqlalchemy import select
        from app.models.product import Product

        p = Product(
            tenant_id=test_tenant.id,
            name="Test Ürün",
            sku=f"SKU-{uuid.uuid4().hex[:6]}",
            unit_price=10,
            stock_quantity=50,
        )
        db_session.add(p)
        db_session.flush()

        r = client.post("/api/sales/records", json=self._make_payload(p.id))
        assert r.status_code == 201, r.text
        assert r.json()["created_by_user_id"] == test_admin.id

        rec = db_session.scalar(
            select(SalesRecord).where(SalesRecord.id == r.json()["id"])
        )
        assert rec is not None
        assert rec.created_by_user_id == test_admin.id
