from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.db import SessionLocal, init_db
from app.models.product import Product
from app.models.sales import SalesItem, SalesRecord


def _d(value: str) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"))


def seed_sales(*, days: int = 60, records_per_day_min: int = 0, records_per_day_max: int = 2) -> None:
    init_db()
    db: Session = SessionLocal()
    try:
        products = list(db.scalars(select(Product)).all())
        if not products:
            products = [
                Product(sku="SKU-2001", name="Demo Mouse", unit_price=_d("249.90")),
                Product(sku="SKU-2002", name="Demo Keyboard", unit_price=_d("899.00")),
                Product(sku="SKU-2003", name="Demo USB-C Hub", unit_price=_d("399.50")),
            ]
            db.add_all(products)
            db.commit()
            products = list(db.scalars(select(Product)).all())

        start = date.today() - timedelta(days=days)
        customers = ["Acme", "Nova", "Atlas", "Pera", "Delta", "Zenith"]

        # Record_no çakışmasını önlemek için mevcut max id tabanlı prefix
        existing = db.scalars(select(SalesRecord.record_no)).all()
        existing_set = set(existing)

        created_records = 0
        for i in range(days):
            day = start + timedelta(days=i)
            count = random.randint(records_per_day_min, records_per_day_max)

            for j in range(count):
                record_no = f"DEMO-{day.strftime('%Y%m%d')}-{j+1}"
                if record_no in existing_set:
                    continue

                record = SalesRecord(
                    record_no=record_no,
                    sale_date=day,
                    customer_name=random.choice(customers),
                    total_amount=_d("0.00"),
                )
                db.add(record)
                db.commit()
                db.refresh(record)

                item_count = random.randint(1, 3)
                total = Decimal("0.00")
                for _ in range(item_count):
                    p = random.choice(products)
                    qty = random.randint(1, 5)
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

                record.total_amount = total.quantize(Decimal("0.01"))
                db.add(record)
                db.commit()
                created_records += 1

        print(f"OK: seeded sales_records={created_records}, days={days}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_sales()

