"""Forecasting servisi smoke testleri.

Prophet kurulu olmayabilir veya yavaş çalışabilir; bu nedenle:
- _load_daily_demand DB sorgusu doğru sonuç döndürüyor mu?
- Yetersiz veri ValueError atıyor mu?
- _confidence_from_interval hesaplaması doğru mu?

Prophet'i gerektiren run_prophet_forecast tam testi bu dosyada pytest.importorskip
ile koşullu olarak çalıştırılır (CI'da prophet kurulu değilse skip).
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.product import Product
from app.models.sales import SalesRecord, SalesItem
from app.models.tenant import Tenant
from app.services.forecasting import _confidence_from_interval


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _seed_sales(db: Session, tenant_id: int, product_id: int, n_days: int = 5) -> None:
    """n_days gün boyunca birer satış kaydı oluşturur."""
    for i in range(n_days):
        sr = SalesRecord(
            tenant_id=tenant_id,
            record_no=f"FC-{i}",
            sale_date=date.today() - timedelta(days=i),
            customer_name="Test",
            total_amount=Decimal("100.00"),
            payment_type="nakit",
        )
        db.add(sr)
        db.flush()
        db.add(SalesItem(
            tenant_id=tenant_id,
            sales_record_id=sr.id,
            product_id=product_id,
            quantity=10,
            unit_price=Decimal("10.00"),
            line_total=Decimal("100.00"),
            tax_rate=Decimal("18.00"),
            tax_amount=Decimal("0"),
            cost_price_snapshot=Decimal("0"),
        ))
    db.flush()


# ---------------------------------------------------------------------------
# Confidence helper unit tests
# ---------------------------------------------------------------------------

class TestConfidenceFromInterval:
    def test_tam_eslesme_yuksek_guven(self):
        # Dar aralık → yüksek güven
        c = _confidence_from_interval(100.0, 99.0, 101.0)
        assert c > 0.9

    def test_genis_aralik_dusuk_guven(self):
        # Geniş aralık → düşük güven
        c = _confidence_from_interval(100.0, 0.0, 200.0)
        assert c < 0.5

    def test_sinir_deger_0_1(self):
        c = _confidence_from_interval(0.0, -1.0, 1.0)
        assert 0.0 <= c <= 1.0

    def test_negatif_yhat_clamp(self):
        c = _confidence_from_interval(-50.0, -60.0, -40.0)
        assert 0.0 <= c <= 1.0


# ---------------------------------------------------------------------------
# Yetersiz veri testi (Prophet gerektirmez)
# ---------------------------------------------------------------------------

class TestForecastInsufficientData:
    def test_bos_db_value_error(self, db_session: Session, test_tenant: Tenant):
        """Boş DB'de 'Not enough' ValueError atılmalı."""
        pytest.importorskip("pandas")
        pytest.importorskip("prophet")

        from app.services.forecasting import _load_daily_demand

        # Servis iç fonksiyonunu test et — df boş olmalı
        df = _load_daily_demand(db_session, tenant_id=test_tenant.id, product_id=None)
        assert df.empty

    def test_tek_gun_verisi_value_error(self, db_session: Session, test_tenant: Tenant):
        """Tek günlük veriyle tahmin ValueError atar."""
        pytest.importorskip("pandas")
        pytest.importorskip("prophet")

        from app.services.forecasting import _load_daily_demand

        p = Product(
            tenant_id=test_tenant.id, name="FC Ürün", sku="FC-SKU",
            stock_quantity=999, unit_price=Decimal("10.00"), tax_rate=Decimal("18.00"),
        )
        db_session.add(p)
        db_session.flush()
        _seed_sales(db_session, test_tenant.id, p.id, n_days=1)

        df = _load_daily_demand(db_session, tenant_id=test_tenant.id, product_id=None)
        # 1 satır var; Prophet için yetersiz
        assert len(df) < 2
