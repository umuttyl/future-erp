"""Müşteri sağlık skoru servisi testleri.

Kapsam:
- Müşteri olmayan tenant → boş liste
- Satışı olan müşteri skor alıyor
- _tier sınır değerleri: >=80 healthy, >=60 good, >=40 at_risk, <40 critical
- Farklı tenant izolasyonu
"""

from datetime import date, timedelta
from decimal import Decimal  # noqa: F401 (used in _sale helper)

import pytest
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.product import Product
from app.models.sales import SalesRecord, SalesItem
from app.models.tenant import Tenant
from app.services.customer_health_service import compute_customer_health, _tier


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _customer(db: Session, tenant_id: int, name: str = "Müşteri") -> Customer:
    c = Customer(
        tenant_id=tenant_id,
        name=name,
        email=f"{name.lower().replace(' ', '')}@test.com",
        customer_type="bireysel",
    )
    db.add(c)
    db.flush()
    return c


def _product(db: Session, tenant_id: int) -> Product:
    p = Product(
        tenant_id=tenant_id,
        name="Test Ürün",
        sku="SKU-HEALTH",
        stock_quantity=9999,
        unit_price=Decimal("100.00"),
        tax_rate=Decimal("18.00"),
    )
    db.add(p)
    db.flush()
    return p


def _sale(
    db: Session,
    tenant_id: int,
    customer_id: int,
    product_id: int,
    *,
    days_ago: int = 0,
    amount: str = "100.00",
) -> SalesRecord:
    sr = SalesRecord(
        tenant_id=tenant_id,
        record_no=f"SR-{customer_id}-{days_ago}",
        sale_date=date.today() - timedelta(days=days_ago),
        customer_id=customer_id,
        customer_name="Test",
        total_amount=Decimal(amount),
        payment_type="nakit",
    )
    db.add(sr)
    db.flush()
    item = SalesItem(
        tenant_id=tenant_id,
        sales_record_id=sr.id,
        product_id=product_id,
        quantity=1,
        unit_price=Decimal(amount),
        line_total=Decimal(amount),
        tax_rate=Decimal("18.00"),
        tax_amount=Decimal("0"),
        cost_price_snapshot=Decimal("0"),
    )
    db.add(item)
    db.flush()
    return sr


# ---------------------------------------------------------------------------
# _tier unit tests
# ---------------------------------------------------------------------------

class TestTierFunction:
    def test_80_healthy(self):      assert _tier(80) == "healthy"
    def test_100_healthy(self):     assert _tier(100) == "healthy"
    def test_79_good(self):         assert _tier(79) == "good"
    def test_60_good(self):         assert _tier(60) == "good"
    def test_59_at_risk(self):      assert _tier(59) == "at_risk"
    def test_40_at_risk(self):      assert _tier(40) == "at_risk"
    def test_39_critical(self):     assert _tier(39) == "critical"
    def test_0_critical(self):      assert _tier(0) == "critical"


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------

class TestComputeCustomerHealth:
    def test_bos_tenant_bos_liste(self, db_session: Session, test_tenant: Tenant):
        result = compute_customer_health(db_session, tenant_id=test_tenant.id)
        assert result == []

    def test_satisi_olan_musteri_skor_aliyor(self, db_session: Session, test_tenant: Tenant):
        c = _customer(db_session, test_tenant.id)
        p = _product(db_session, test_tenant.id)

        # Son 90 günde 3 satış
        for i in range(3):
            _sale(db_session, test_tenant.id, c.id, p.id, days_ago=i * 10, amount="200.00")

        result = compute_customer_health(db_session, tenant_id=test_tenant.id)
        assert len(result) == 1
        score = result[0]
        assert score.customer_id == c.id
        assert 0 <= score.score <= 100
        assert score.tier in ("healthy", "good", "at_risk", "critical")
        assert score.orders_90d == 3

    def test_eski_satis_recency_dusuk(self, db_session: Session, test_tenant: Tenant):
        c = _customer(db_session, test_tenant.id)
        p = _product(db_session, test_tenant.id)

        # 200 gün önce (90 gün dışı) → frekans=0, recency düşük
        _sale(db_session, test_tenant.id, c.id, p.id, days_ago=200, amount="500.00")

        result = compute_customer_health(db_session, tenant_id=test_tenant.id)
        assert len(result) == 1
        assert result[0].tier in ("at_risk", "critical")

    def test_tenant_izolasyonu(self, db_session: Session, test_tenant: Tenant):
        other = Tenant(name="Diğer Tenant", slug="other-tenant")
        db_session.add(other)
        db_session.flush()

        c_mine = _customer(db_session, test_tenant.id, "Benim Müşteri")
        c_other = _customer(db_session, other.id, "Onların Müşterisi")
        p_mine = _product(db_session, test_tenant.id)
        p_other = _product(db_session, other.id)

        _sale(db_session, test_tenant.id, c_mine.id, p_mine.id, days_ago=5)
        _sale(db_session, other.id, c_other.id, p_other.id, days_ago=5)

        result = compute_customer_health(db_session, tenant_id=test_tenant.id)
        assert all(r.customer_id == c_mine.id for r in result)
        assert len(result) == 1
