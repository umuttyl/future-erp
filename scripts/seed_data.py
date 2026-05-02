"""Geliştirme için zengin örnek veri seed script'i.

Kullanım:
    python scripts/seed_data.py            # ek verileri üret (tabloyu koru)
    python scripts/seed_data.py --reset    # DB'yi sıfırla ve yeniden doldur
"""
from __future__ import annotations

import argparse
import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.db import SessionLocal, engine, init_db  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.models.product import Product  # noqa: E402
from app.models.sales import SalesItem, SalesRecord  # noqa: E402
from app.models.stock_movement import StockMovement  # noqa: E402


def _d(value: str | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


PRODUCTS_DATA = [
    # (sku, name, category, unit_price, cost_price, initial_stock, reorder_level)
    ("SKU-2001", "Demo Mouse",             "Peripherals", 249.90,  110.00, 600, 50),
    ("SKU-2002", "Demo Keyboard",          "Peripherals", 899.00,  450.00, 400, 40),
    ("SKU-2003", "Demo USB-C Hub",         "Accessories", 399.50,  180.00, 350, 35),
    ("SKU-2004", "Demo Headset",           "Audio",       1299.00, 650.00, 220, 25),
    ("SKU-2005", "Demo Webcam HD",         "Peripherals", 749.00,  320.00, 180, 20),
    ("SKU-2006", "Demo 27\" Monitor",      "Display",     5490.00, 3200.00, 90,  8),
    ("SKU-2007", "Demo Laptop Stand",      "Accessories", 349.00,  120.00, 450, 45),
    ("SKU-2008", "Demo Power Bank",        "Accessories", 549.00,  230.00, 380, 40),
    ("SKU-2009", "Demo Bluetooth Speaker", "Audio",       1199.00, 520.00, 140, 15),
    ("SKU-2010", "Demo Mechanical KB",     "Peripherals", 1990.00, 980.00, 110, 12),
    ("SKU-2011", "Demo Desk Lamp",         "Accessories", 449.00,  180.00, 260, 25),
    ("SKU-2012", "Demo SSD 1TB",           "Storage",     1790.00, 950.00, 200, 20),
]

CUSTOMERS = [
    "Acme Tekno", "Nova Bilişim", "Atlas Dağıtım", "Pera Mağazacılık",
    "Delta Ofis", "Zenith Çözüm", "Ege Ticaret", "Marmara Grup",
    "Anadolu Ofis", "Pardus Yazılım",
]


def _reset_database() -> None:
    print("[seed] Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    print("[seed] Creating all tables...")
    Base.metadata.create_all(bind=engine)


def _seed_products(db: Session) -> list[Product]:
    existing = {p.sku: p for p in db.scalars(select(Product)).all()}

    products: list[Product] = []
    created = 0
    for sku, name, cat, price, cost, stock, reorder in PRODUCTS_DATA:
        if sku in existing:
            p = existing[sku]
            p.name = name
            p.category = cat
            p.unit_price = _d(price)
            p.cost_price = _d(cost)
            if p.stock_quantity == 0:
                p.stock_quantity = stock
            p.reorder_level = reorder
            db.add(p)
            products.append(p)
            continue

        p = Product(
            sku=sku,
            name=name,
            category=cat,
            unit_price=_d(price),
            cost_price=_d(cost),
            stock_quantity=stock,
            reorder_level=reorder,
        )
        db.add(p)
        products.append(p)
        created += 1

    db.commit()
    for p in products:
        db.refresh(p)

    for p in products:
        has_in = db.scalar(
            select(StockMovement.id)
            .where(StockMovement.product_id == p.id)
            .where(StockMovement.movement_type == "in")
            .limit(1)
        )
        if not has_in and p.stock_quantity > 0:
            db.add(
                StockMovement(
                    product_id=p.id,
                    movement_type="in",
                    change=p.stock_quantity,
                    balance_after=p.stock_quantity,
                    reference="seed",
                    note="Başlangıç stoğu (seed)",
                )
            )
    db.commit()

    print(f"[seed] Products ready (new: {created}, total: {len(products)})")
    return products


def _seed_sales(db: Session, products: list[Product], *, days: int = 120) -> None:
    random.seed(42)
    start = date.today() - timedelta(days=days)
    existing_nos = set(db.scalars(select(SalesRecord.record_no)).all())

    created_records = 0
    for i in range(days + 1):
        day = start + timedelta(days=i)
        weekday = day.weekday()  # 0=Mon, 6=Sun

        if i > 0 and i % 20 == 0:
            for p in products:
                refill = max(p.reorder_level * 4, 40)
                p.stock_quantity = p.stock_quantity + refill
                db.add(p)
                db.flush()
                db.add(
                    StockMovement(
                        product_id=p.id,
                        movement_type="in",
                        change=refill,
                        balance_after=p.stock_quantity,
                        reference=f"PO-{day.strftime('%Y%m%d')}",
                        note="Tedarikçi sevkiyatı (seed)",
                    )
                )
            db.commit()

        base_orders = 2 if weekday < 5 else 1
        trend = 1.0 + (i / max(1, days)) * 0.4  # zaman içinde artış
        count = max(0, int(round(base_orders * trend * random.uniform(0.6, 1.5))))
        if weekday == 6 and random.random() < 0.3:
            count = 0  # bazı pazarlar kapalı

        for j in range(count):
            record_no = f"SO-{day.strftime('%Y%m%d')}-{j+1:02d}"
            if record_no in existing_nos:
                continue

            record = SalesRecord(
                record_no=record_no,
                sale_date=day,
                customer_name=random.choice(CUSTOMERS),
                total_amount=_d(0),
            )
            db.add(record)
            db.flush()

            item_count = random.randint(1, 4)
            total = Decimal("0.00")
            chosen_ids: set[int] = set()
            for _ in range(item_count):
                candidates = [p for p in products if p.stock_quantity > 0 and p.id not in chosen_ids]
                if not candidates:
                    break
                p = random.choice(candidates)
                chosen_ids.add(p.id)

                max_qty = min(5, p.stock_quantity)
                qty = random.randint(1, max_qty)

                unit_price = Decimal(p.unit_price)
                line_total = (Decimal(qty) * unit_price).quantize(Decimal("0.01"))
                total += line_total

                db.add(
                    SalesItem(
                        sales_record_id=record.id,
                        product_id=p.id,
                        quantity=qty,
                        unit_price=unit_price,
                        line_total=line_total,
                    )
                )

                p.stock_quantity = p.stock_quantity - qty
                db.add(p)
                db.flush()
                db.add(
                    StockMovement(
                        product_id=p.id,
                        movement_type="out",
                        change=-qty,
                        balance_after=p.stock_quantity,
                        reference=record_no,
                        note=f"Satış {record_no}",
                    )
                )

            record.total_amount = total
            db.add(record)
            db.commit()
            created_records += 1

    print(f"[seed] Sales records created: {created_records} (days={days})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Tabloları silip yeniden oluştur")
    parser.add_argument("--days", type=int, default=120, help="Kaç günlük satış üretilsin")
    args = parser.parse_args()

    if args.reset:
        _reset_database()
    else:
        init_db()

    db: Session = SessionLocal()
    try:
        products = _seed_products(db)
        _seed_sales(db, products, days=args.days)
        total_products = db.scalar(select(Product).order_by(Product.id))
        total_sales = db.scalar(
            select(SalesRecord).order_by(SalesRecord.id.desc())
        )
        print(
            f"[seed] Done. total products row id (any): "
            f"{getattr(total_products, 'id', None)}, "
            f"latest sales id: {getattr(total_sales, 'id', None)}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
