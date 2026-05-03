"""Future ERP - Seed Data Script.

ON KOSUL: Tablolar Alembic ile olusturulmus olmali:
    alembic upgrade head

Kullanim:
    python scripts/seed_data.py                       # idempotent demo (varsayilan)
    python scripts/seed_data.py --mode minimal        # sadece urun katalogu
    python scripts/seed_data.py --mode demo --days 365
    python scripts/seed_data.py --reset               # tablolari silip yeniden olustur (DEV-ONLY)

Modlar:
    minimal: 30+ urun katalogu, sifir satis. Test ve "bos baslangic" icin.
    demo:    minimal + 50+ musteri uzerinden 365 gunluk gercekci satis verisi
             (trend + haftalik mevsimsellik + ay sonu zirve + iadeler + sayim
             duzeltmeleri). Prophet forecast icin anlamli zaman serisi.

Idempotent: tekrar calistiginda mevcut SKU/record_no'lari atlar, yenilerini ekler.
"""
from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.db import SessionLocal, engine  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.models.product import Product  # noqa: E402
from app.models.sales import SalesItem, SalesRecord  # noqa: E402
from app.models.stock_movement import StockMovement  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402


# ===========================================================================
# Yardimcilar
# ===========================================================================

def _d(value: str | float | int) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _default_tenant_id(db: Session) -> int:
    tid = db.scalar(select(Tenant.id).where(Tenant.slug == "default"))
    if tid is None:
        raise RuntimeError("Varsayılan kiracı yok. Önce: alembic upgrade head")
    return int(tid)


@dataclass(frozen=True)
class ProductSpec:
    sku: str
    name: str
    category: str
    unit_price: float
    cost_price: float
    initial_stock: int
    reorder_level: int
    popularity: float = 1.0  # 0.3 = nadir satilan, 2.0 = cok satilan


# ===========================================================================
# 1) URUN KATALOGU (40 urun, 8 kategori)
# ===========================================================================

PRODUCT_CATALOG: list[ProductSpec] = [
    # Peripherals (8)
    ProductSpec("SKU-2001", "Demo Wired Mouse",         "Peripherals",  249.90,  110.00, 600, 50, 1.8),
    ProductSpec("SKU-2002", "Demo Wireless Mouse",      "Peripherals",  449.90,  200.00, 400, 40, 1.5),
    ProductSpec("SKU-2003", "Demo Membrane Keyboard",   "Peripherals",  599.00,  280.00, 300, 30, 1.2),
    ProductSpec("SKU-2004", "Demo Mechanical Keyboard", "Peripherals", 1990.00,  980.00, 110, 12, 0.8),
    ProductSpec("SKU-2005", "Demo Webcam HD",           "Peripherals",  749.00,  320.00, 180, 20, 0.9),
    ProductSpec("SKU-2006", "Demo Webcam 4K",           "Peripherals", 1499.00,  720.00,  90, 10, 0.5),
    ProductSpec("SKU-2007", "Demo Drawing Tablet",      "Peripherals", 2790.00, 1450.00,  60,  6, 0.3),
    ProductSpec("SKU-2008", "Demo Trackpad",            "Peripherals",  899.00,  420.00, 120, 15, 0.6),

    # Audio (5)
    ProductSpec("SKU-2101", "Demo Headset",             "Audio",       1299.00,  650.00, 220, 25, 1.4),
    ProductSpec("SKU-2102", "Demo Wireless Earbuds",    "Audio",       1690.00,  820.00, 180, 20, 1.3),
    ProductSpec("SKU-2103", "Demo Bluetooth Speaker",   "Audio",       1199.00,  520.00, 140, 15, 1.0),
    ProductSpec("SKU-2104", "Demo Studio Microphone",   "Audio",       2490.00, 1280.00,  70,  8, 0.4),
    ProductSpec("SKU-2105", "Demo Soundbar",            "Audio",       3990.00, 2150.00,  45,  5, 0.3),

    # Display (4)
    ProductSpec("SKU-2201", "Demo 24\" Monitor",         "Display",     3990.00, 2100.00, 110, 12, 0.9),
    ProductSpec("SKU-2202", "Demo 27\" Monitor",         "Display",     5490.00, 3200.00,  90,  8, 0.8),
    ProductSpec("SKU-2203", "Demo 32\" UltraWide",       "Display",     9990.00, 6100.00,  35,  4, 0.4),
    ProductSpec("SKU-2204", "Demo Portable Monitor",    "Display",     2490.00, 1380.00,  80,  8, 0.5),

    # Storage (5)
    ProductSpec("SKU-2301", "Demo SSD 256GB",           "Storage",      890.00,  430.00, 350, 35, 1.1),
    ProductSpec("SKU-2302", "Demo SSD 512GB",           "Storage",     1290.00,  680.00, 280, 28, 1.3),
    ProductSpec("SKU-2303", "Demo SSD 1TB",             "Storage",     1790.00,  950.00, 200, 20, 1.5),
    ProductSpec("SKU-2304", "Demo SSD 2TB",             "Storage",     3290.00, 1880.00, 100, 10, 0.7),
    ProductSpec("SKU-2305", "Demo Portable HDD 4TB",    "Storage",     2190.00, 1180.00, 130, 13, 0.6),

    # Networking (4)
    ProductSpec("SKU-2401", "Demo USB-C Hub",           "Networking",   399.50,  180.00, 350, 35, 1.6),
    ProductSpec("SKU-2402", "Demo USB-C Dock 8-in-1",   "Networking",  1490.00,  720.00, 160, 18, 0.9),
    ProductSpec("SKU-2403", "Demo WiFi 6 Router",       "Networking",  2790.00, 1480.00,  90, 10, 0.5),
    # Düşük stok: WS bildirimi + auto-draft demosu için kritik eşik altında başlangıç.
    ProductSpec("SKU-2404", "Demo Mesh WiFi 3-pack",    "Networking",  5990.00, 3380.00,   8, 40, 0.3),

    # Accessories (6)
    ProductSpec("SKU-2501", "Demo Laptop Stand",        "Accessories",  349.00,  120.00, 450, 45, 1.4),
    ProductSpec("SKU-2502", "Demo Desk Lamp",           "Accessories",  449.00,  180.00, 260, 25, 1.0),
    ProductSpec("SKU-2503", "Demo Monitor Arm",         "Accessories",  890.00,  410.00, 180, 20, 0.8),
    ProductSpec("SKU-2504", "Demo Mousepad XL",         "Accessories",  149.00,   55.00, 700, 70, 1.7),
    ProductSpec("SKU-2505", "Demo Cable Organizer Kit", "Accessories",   99.00,   30.00, 850, 85, 1.5),
    ProductSpec("SKU-2506", "Demo Laptop Sleeve 14\"",   "Accessories",  299.00,  130.00, 320, 32, 1.1),

    # Power (4)
    ProductSpec("SKU-2601", "Demo Power Bank 10000",    "Power",        549.00,  230.00, 380, 40, 1.4),
    ProductSpec("SKU-2602", "Demo Power Bank 20000",    "Power",        890.00,  410.00, 240, 25, 1.2),
    ProductSpec("SKU-2603", "Demo USB-C Charger 65W",   "Power",        599.00,  270.00, 300, 30, 1.3),
    ProductSpec("SKU-2604", "Demo Surge Protector",     "Power",        349.00,  140.00, 220, 22, 0.8),

    # Cables (4)
    ProductSpec("SKU-2701", "Demo USB-C Cable 1m",      "Cables",        99.00,   28.00, 1200, 120, 2.0),
    ProductSpec("SKU-2702", "Demo USB-C Cable 2m",      "Cables",       149.00,   45.00,  900,  90, 1.7),
    ProductSpec("SKU-2703", "Demo HDMI 2.1 Cable",      "Cables",       249.00,   95.00,  600,  60, 1.0),
    ProductSpec("SKU-2704", "Demo DisplayPort Cable",   "Cables",       199.00,   75.00,  500,  50, 0.7),
]


# ===========================================================================
# 2) MUSTERI HAVUZU (60 musteri: 35 B2B + 25 B2C karisik)
# ===========================================================================

CUSTOMERS_B2B: list[str] = [
    "Acme Tekno A.S.", "Nova Bilisim Ltd.", "Atlas Dagitim", "Pera Magazacilik",
    "Delta Ofis Cozumleri", "Zenith Yazilim", "Ege Ticaret", "Marmara Grup",
    "Anadolu Ofis", "Pardus Yazilim Ltd.", "Karadeniz Tekno", "Kuzey Bilisim",
    "Bogazici Sistem", "Kadikoy Bilgisayar", "Levent Ofis Tedarik",
    "Beyoglu Tasarim Ofisi", "Bursa Tedarik A.S.", "Izmir IT Servis",
    "Ankara Yazilim Evi", "Antalya Tekno Pazar", "Konya Bilisim",
    "Trabzon Ofis Market", "Adana Sistem", "Eskisehir Yazilim",
    "Mersin Bilisim", "Gaziantep Tekno", "Samsun Ofis", "Diyarbakir Sistem",
    "Tarabya Tasarim", "Maslak Tekno Plaza", "Atasehir Bilisim Hub",
    "Goztepe Bilgisayar", "Sariyer Software", "Etiler Ofis Servis",
    "Kavacik Tekno",
]

CUSTOMERS_B2C: list[str] = [
    "Ahmet Yilmaz", "Mehmet Kaya", "Ayse Demir", "Fatma Sahin", "Ali Celik",
    "Zeynep Ozturk", "Mustafa Aydin", "Hatice Yildiz", "Hasan Aksoy",
    "Emine Polat", "Ibrahim Kara", "Elif Sezer", "Yusuf Erdogan", "Selin Cetin",
    "Burak Tas", "Zeliha Kurt", "Cem Yavuz", "Pinar Aslan", "Onur Korkmaz",
    "Merve Tekin", "Berk Acar", "Esra Gul", "Eren Bulut", "Nazli Acikgoz",
    "Tolga Sevim",
]

ALL_CUSTOMERS: list[str] = CUSTOMERS_B2B + CUSTOMERS_B2C


# ===========================================================================
# 3) RESET (DEV-ONLY)
# ===========================================================================

def _reset_database() -> None:
    """DEV-ONLY: tablolari Alembic ile temiz hale getir.

    1) Tum tablolari dusur (alembic_version dahil)
    2) Alembic upgrade head ile tablolari yeniden olustur (migration zinciri uzerinden)

    Boylece DB ile alembic_version tutarli kalir.
    """
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text

    print("[seed] Dropping all tables (DEV-ONLY)...")
    Base.metadata.drop_all(bind=engine)
    # alembic_version tablosunu da elle dusur (Base.metadata bilmez)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))

    print("[seed] Running 'alembic upgrade head'...")
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")


# ===========================================================================
# 4) URUN SEED (idempotent)
# ===========================================================================

def _seed_products(db: Session, catalog: Iterable[ProductSpec], *, tenant_id: int) -> dict[str, Product]:
    """SKU bazli idempotent urun seed. Mevcutlari gunceller, yeni olanlari ekler."""
    catalog = list(catalog)
    existing = {
        p.sku: p
        for p in db.scalars(select(Product).where(Product.tenant_id == tenant_id)).all()
    }

    out: dict[str, Product] = {}
    created = 0
    updated = 0

    for spec in catalog:
        if spec.sku in existing:
            p = existing[spec.sku]
            p.name = spec.name
            p.category = spec.category
            p.unit_price = _d(spec.unit_price)
            p.cost_price = _d(spec.cost_price)
            p.reorder_level = spec.reorder_level
            db.add(p)
            updated += 1
        else:
            p = Product(
                tenant_id=tenant_id,
                sku=spec.sku,
                name=spec.name,
                category=spec.category,
                unit_price=_d(spec.unit_price),
                cost_price=_d(spec.cost_price),
                stock_quantity=spec.initial_stock,
                reorder_level=spec.reorder_level,
            )
            db.add(p)
            created += 1
        out[spec.sku] = p

    db.commit()
    for p in out.values():
        db.refresh(p)

    # Acilis stogu hareketi (yeni urunler icin)
    for spec in catalog:
        p = out[spec.sku]
        already_in = db.scalar(
            select(StockMovement.id)
            .where(StockMovement.product_id == p.id)
            .where(StockMovement.tenant_id == tenant_id)
            .where(StockMovement.movement_type == "in")
            .limit(1)
        )
        if not already_in and p.stock_quantity > 0:
            db.add(
                StockMovement(
                    tenant_id=tenant_id,
                    product_id=p.id,
                    movement_type="in",
                    change=p.stock_quantity,
                    balance_after=p.stock_quantity,
                    reference="seed",
                    note="Acilis stogu (seed)",
                )
            )
    db.commit()

    print(f"[seed] Products: created={created}, updated={updated}, total={len(out)}")
    return out


# ===========================================================================
# 5) SATIS SEED (365 gun gercekci)
# ===========================================================================

def _daily_sales_count(day: date, days_total: int, day_index: int) -> int:
    """Gun bazinda satis adedini belirleyen heuristik.

    Faktorler:
    - Hafta ici / hafta sonu farki
    - Pazar gunlerinde dusus (bazi musteriler kapali)
    - Ay sonu zirve (bordro sonrasi)
    - Yil boyunca trend (yavaslarak buyume)
    - Yilbasi/Bayram benzeri ekstra zirveler (ay basi)
    """
    weekday = day.weekday()  # 0=Pzt, 6=Pzr
    base = 6 if weekday < 5 else 3
    if weekday == 6:
        base = max(1, base - 2)  # pazar dusus

    # Ay sonu zirve (son 3 gun)
    days_in_month = (date(day.year, day.month, 28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    if day.day >= days_in_month.day - 2:
        base = int(base * 1.4)

    # Yil boyu trend: %0 -> %35 lineer artis
    trend = 1.0 + (day_index / max(1, days_total)) * 0.35

    # Hafif rasgelelik
    noise = random.uniform(0.65, 1.4)

    return max(0, int(round(base * trend * noise)))


def _pick_products_for_order(
    products: list[Product],
    item_count: int,
) -> list[Product]:
    """Populerlik agirligiyla benzersiz urun listesi sec."""
    pool = [p for p in products if p.stock_quantity > 0]
    if not pool:
        return []
    # popularity'ye gore agirlikli secim, tekrarsiz
    weights = []
    for p in pool:
        spec = next((s for s in PRODUCT_CATALOG if s.sku == p.sku), None)
        weights.append(spec.popularity if spec else 1.0)

    chosen: list[Product] = []
    available = list(pool)
    available_weights = list(weights)
    target = min(item_count, len(available))
    for _ in range(target):
        if not available:
            break
        idx = random.choices(range(len(available)), weights=available_weights, k=1)[0]
        chosen.append(available.pop(idx))
        available_weights.pop(idx)
    return chosen


def _seed_sales(
    db: Session,
    products_by_sku: dict[str, Product],
    *,
    tenant_id: int,
    days: int = 365,
) -> int:
    """Gunluk gercekci satis kayitlari uret."""
    random.seed(42)
    products = list(products_by_sku.values())

    start = date.today() - timedelta(days=days)
    existing_nos = set(
        db.scalars(select(SalesRecord.record_no).where(SalesRecord.tenant_id == tenant_id)).all()
    )

    created = 0
    for i in range(days + 1):
        day = start + timedelta(days=i)

        # Periyodik mal kabul: her 3 haftada bir tum urunler icin tedarikci sevkiyati
        if i > 0 and i % 21 == 0:
            for p in products:
                refill = max(p.reorder_level * 5, 50)
                p.stock_quantity = (p.stock_quantity or 0) + refill
                db.add(p)
                db.flush()
                db.add(
                    StockMovement(
                        tenant_id=tenant_id,
                        product_id=p.id,
                        movement_type="in",
                        change=refill,
                        balance_after=p.stock_quantity,
                        reference=f"PO-{day.strftime('%Y%m%d')}",
                        note="Tedarikci sevkiyati (seed)",
                    )
                )
            db.commit()

        order_count = _daily_sales_count(day, days, i)

        for j in range(order_count):
            record_no = f"SO-{day.strftime('%Y%m%d')}-{j+1:02d}"
            if record_no in existing_nos:
                continue

            customer = random.choice(ALL_CUSTOMERS)
            record = SalesRecord(
                tenant_id=tenant_id,
                record_no=record_no,
                sale_date=day,
                customer_name=customer,
                total_amount=_d(0),
            )
            db.add(record)
            db.flush()

            item_count = random.randint(1, 4)
            picks = _pick_products_for_order(products, item_count)
            if not picks:
                # Hicbir urun yok (stok bitmis) -> bu siparis iptal
                db.delete(record)
                continue

            total = Decimal("0.00")
            for p in picks:
                max_qty = min(5, p.stock_quantity)
                if max_qty <= 0:
                    continue
                qty = random.randint(1, max_qty)
                unit_price = Decimal(p.unit_price)
                line_total = (Decimal(qty) * unit_price).quantize(Decimal("0.01"))
                total += line_total

                db.add(
                    SalesItem(
                        tenant_id=tenant_id,
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
                        tenant_id=tenant_id,
                        product_id=p.id,
                        movement_type="out",
                        change=-qty,
                        balance_after=p.stock_quantity,
                        reference=record_no,
                        note=f"Satis {record_no}",
                    )
                )

            record.total_amount = total
            db.add(record)
            db.commit()
            created += 1

    print(f"[seed] Sales records: created={created} (days={days})")
    return created


# ===========================================================================
# 6) IADELER VE SAYIM DUZELTMELERI (rare)
# ===========================================================================

def _seed_returns_and_adjustments(
    db: Session,
    products: list[Product],
    *,
    tenant_id: int,
    days: int = 365,
) -> None:
    """%1 oraninda iade + sayim duzeltmesi."""
    random.seed(7)
    today = date.today()

    # Son 30 gunden 5 iade
    for _ in range(5):
        p = random.choice(products)
        qty = random.randint(1, 2)
        p.stock_quantity += qty
        db.add(p)
        db.flush()
        db.add(
            StockMovement(
                tenant_id=tenant_id,
                product_id=p.id,
                movement_type="in",
                change=qty,
                balance_after=p.stock_quantity,
                reference=f"RET-{(today - timedelta(days=random.randint(1, 30))).strftime('%Y%m%d')}",
                note="Musteri iadesi (seed)",
            )
        )

    # 8 sayim duzeltmesi (+/- kucuk degerler)
    for _ in range(8):
        p = random.choice(products)
        delta = random.choice([-3, -2, -1, 1, 2])
        new_qty = max(0, p.stock_quantity + delta)
        actual_change = new_qty - p.stock_quantity
        if actual_change == 0:
            continue
        p.stock_quantity = new_qty
        db.add(p)
        db.flush()
        db.add(
            StockMovement(
                tenant_id=tenant_id,
                product_id=p.id,
                movement_type="adjust",
                change=actual_change,
                balance_after=p.stock_quantity,
                reference="STOCKTAKE",
                note="Donem sonu sayim duzeltmesi (seed)",
            )
        )

    db.commit()
    print("[seed] Returns and stock adjustments inserted")


# ===========================================================================
# 7) SEED MODLARI
# ===========================================================================

def seed_minimal(db: Session) -> None:
    """Sadece urun katalogu, satis yok. Test ve bos baslangic icin."""
    tid = _default_tenant_id(db)
    _seed_products(db, PRODUCT_CATALOG, tenant_id=tid)
    print("[seed] Minimal seed complete (no sales).")


def seed_demo(db: Session, *, days: int = 365) -> None:
    """Tam demo: katalog + 365 gunluk gercekci satis + iade + sayim."""
    tid = _default_tenant_id(db)
    products_by_sku = _seed_products(db, PRODUCT_CATALOG, tenant_id=tid)
    _seed_sales(db, products_by_sku, tenant_id=tid, days=days)
    _seed_returns_and_adjustments(db, list(products_by_sku.values()), tenant_id=tid, days=days)
    print("[seed] Demo seed complete.")


# ===========================================================================
# 8) CLI
# ===========================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--mode",
        choices=["minimal", "demo"],
        default="demo",
        help="minimal: sadece urunler / demo: tam veri seti (varsayilan)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=365,
        help="Demo modunda gunluk satis verisi kaç günlük olsun (varsayılan 365)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="DEV-ONLY: tum tablolari silip yeniden olustur. Alembic'i atlar.",
    )
    args = parser.parse_args()

    if args.reset:
        _reset_database()

    db: Session = SessionLocal()
    try:
        if args.mode == "minimal":
            seed_minimal(db)
        else:
            seed_demo(db, days=args.days)

        # Ozet
        product_count = db.scalar(select(Product).order_by(Product.id.desc()))
        sales_count_row = db.scalar(select(SalesRecord).order_by(SalesRecord.id.desc()))
        last_product_id = getattr(product_count, "id", 0)
        last_sales_id = getattr(sales_count_row, "id", 0)
        print(
            f"[seed] Done. last_product_id={last_product_id}, "
            f"last_sales_record_id={last_sales_id}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
