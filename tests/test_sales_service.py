"""Satış servisi entegrasyon testleri.

Kapsam:
- Satış oluşturma → stok düşümü → kasa hareketi zinciri (nakit)
- Satış oluşturma → cari hesap hareketi (kredili)
- Stok yetersizliğinde ValueError
- daily_sales_points doğru topluyor
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.cashbook import CashAccount, CashTransaction
from app.models.account_movement import AccountMovement
from app.models.customer import Customer
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.models.tenant import Tenant
from app.schemas.sales import SalesItemCreate, SalesRecordCreate
from app.services.sales_service import sales_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _product(db: Session, tenant_id: int, *, name: str = "Ürün A", stock: int = 100) -> Product:
    p = Product(
        tenant_id=tenant_id,
        name=name,
        sku=f"SKU-{name}",
        stock_quantity=stock,
        unit_price=Decimal("50.00"),
        tax_rate=Decimal("18.00"),
    )
    db.add(p)
    db.flush()
    return p


def _cash_account(db: Session, tenant_id: int) -> CashAccount:
    acc = CashAccount(
        tenant_id=tenant_id,
        name="Ana Kasa",
        account_type="cash",
        balance=Decimal("0"),
        is_active=True,
    )
    db.add(acc)
    db.flush()
    return acc


def _customer(db: Session, tenant_id: int) -> Customer:
    c = Customer(
        tenant_id=tenant_id,
        name="Test Müşteri",
        email="musteri@test.com",
        customer_type="bireysel",
    )
    db.add(c)
    db.flush()
    return c


def _sale_data(
    product_id: int,
    *,
    qty: int = 5,
    price: str = "50.00",
    payment: str = "nakit",
    customer_id: int | None = None,
    record_no: str = "SR-001",
) -> SalesRecordCreate:
    return SalesRecordCreate(
        record_no=record_no,
        sale_date=date.today(),
        customer_id=customer_id,
        customer_name="Test Müşteri",
        payment_type=payment,
        items=[SalesItemCreate(product_id=product_id, quantity=qty, unit_price=Decimal(price))],
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSalesServiceCreate:
    def test_nakit_satis_stok_dusuyor(self, db_session: Session, test_tenant: Tenant):
        p = _product(db_session, test_tenant.id, stock=20)
        _cash_account(db_session, test_tenant.id)

        record = sales_service.create_record(
            db_session, test_tenant.id, _sale_data(p.id, qty=5)
        )
        db_session.flush()

        assert record.id is not None
        assert record.total_amount == Decimal("250.00")
        # Stok düştü
        db_session.refresh(p)
        assert p.stock_quantity == 15

    def test_nakit_satis_kasa_hareketi_olusturuluyor(self, db_session: Session, test_tenant: Tenant):
        p = _product(db_session, test_tenant.id, stock=50)
        acc = _cash_account(db_session, test_tenant.id)

        sales_service.create_record(db_session, test_tenant.id, _sale_data(p.id, qty=10))
        db_session.flush()

        txn = db_session.query(CashTransaction).filter_by(
            tenant_id=test_tenant.id, transaction_type="income"
        ).first()
        assert txn is not None
        assert txn.amount == Decimal("500.00")

        db_session.refresh(acc)
        assert acc.balance == Decimal("500.00")

    def test_kredili_satis_cari_hesap_hareketi(self, db_session: Session, test_tenant: Tenant):
        p = _product(db_session, test_tenant.id, stock=30)
        c = _customer(db_session, test_tenant.id)

        sales_service.create_record(
            db_session, test_tenant.id,
            _sale_data(p.id, qty=2, payment="kredi", customer_id=c.id)
        )
        db_session.flush()

        mov = db_session.query(AccountMovement).filter_by(
            tenant_id=test_tenant.id, movement_type="debit"
        ).first()
        assert mov is not None
        assert mov.customer_id == c.id
        assert mov.amount == Decimal("100.00")

    def test_stok_movement_kaydi_olusturuluyor(self, db_session: Session, test_tenant: Tenant):
        p = _product(db_session, test_tenant.id, stock=40)
        _cash_account(db_session, test_tenant.id)

        sales_service.create_record(db_session, test_tenant.id, _sale_data(p.id, qty=3))
        db_session.flush()

        sm = db_session.query(StockMovement).filter_by(
            tenant_id=test_tenant.id, product_id=p.id, movement_type="out"
        ).first()
        assert sm is not None
        assert sm.change == -3

    def test_yetersiz_stok_exception(self, db_session: Session, test_tenant: Tenant):
        p = _product(db_session, test_tenant.id, stock=2)

        with pytest.raises(ValueError, match="Yetersiz stok"):
            sales_service.create_record(
                db_session, test_tenant.id, _sale_data(p.id, qty=10)
            )

    def test_olmayan_urun_exception(self, db_session: Session, test_tenant: Tenant):
        with pytest.raises(ValueError, match="Product not found"):
            sales_service.create_record(
                db_session, test_tenant.id, _sale_data(99999, qty=1)
            )


class TestDailySalesPoints:
    def test_doğru_toplam_döner(self, db_session: Session, test_tenant: Tenant):
        p = _product(db_session, test_tenant.id, stock=100)
        _cash_account(db_session, test_tenant.id)

        today = date.today()
        for i in range(3):
            sales_service.create_record(
                db_session, test_tenant.id,
                _sale_data(p.id, qty=2, record_no=f"SR-D{i}")
            )
        db_session.flush()

        points = sales_service.daily_sales_points(db_session, test_tenant.id)
        assert len(points) >= 1
        today_pt = next((pt for pt in points if pt.date == today), None)
        assert today_pt is not None
        assert today_pt.quantity == 6
        assert today_pt.revenue == Decimal("300.00")

    def test_bos_tenant_bos_liste(self, db_session: Session, test_tenant: Tenant):
        points = sales_service.daily_sales_points(db_session, test_tenant.id)
        assert points == []
