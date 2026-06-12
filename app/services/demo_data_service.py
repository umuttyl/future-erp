"""Demo veri yükleme servisi (2C-8).

Yeni kayıtlı tenant'a sektöre özel örnek veri ekler.
"Verilerimi temizle" ile tüm demo veriler silinir.
"""
from __future__ import annotations

import random
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.product import Product
from app.models.sales import SalesItem, SalesRecord
from app.models.stock_movement import StockMovement
from app.models.supply_order import SupplyOrder

# ─── Sektör bazlı ürün verisi ─────────────────────────────────────────────────

_SECTOR_PRODUCTS: dict[str, list[dict]] = {
    "retail": [
        {"sku": "DEMO-001", "name": "Erkek Slim Fit Pantolon", "category": "Giyim", "price": 459, "cost": 210, "stock": 85, "reorder": 20},
        {"sku": "DEMO-002", "name": "Kadın Triko Kazak",        "category": "Giyim", "price": 389, "cost": 175, "stock": 62, "reorder": 15},
        {"sku": "DEMO-003", "name": "Spor Ayakkabı",            "category": "Ayakkabı", "price": 799, "cost": 380, "stock": 40, "reorder": 10},
        {"sku": "DEMO-004", "name": "Deri El Çantası",          "category": "Aksesuar", "price": 650, "cost": 290, "stock": 28, "reorder": 8},
        {"sku": "DEMO-005", "name": "Güneş Gözlüğü UV400",      "category": "Aksesuar", "price": 220, "cost": 90,  "stock": 55, "reorder": 10},
    ],
    "restaurant": [
        {"sku": "DEMO-001", "name": "Filtre Kahve (250g)",  "category": "İçecek",  "price": 180, "cost": 60,  "stock": 120, "reorder": 30},
        {"sku": "DEMO-002", "name": "Espresso Çekirdeği",   "category": "İçecek",  "price": 320, "cost": 140, "stock": 80,  "reorder": 20},
        {"sku": "DEMO-003", "name": "Glutensiz Un (1kg)",   "category": "Hammadde","price": 85,  "cost": 35,  "stock": 200, "reorder": 50},
        {"sku": "DEMO-004", "name": "Organik Tereyağı",     "category": "Hammadde","price": 120, "cost": 55,  "stock": 90,  "reorder": 25},
        {"sku": "DEMO-005", "name": "Ambalaj Kutusu (50lu)","category": "Ambalaj", "price": 75,  "cost": 30,  "stock": 150, "reorder": 40},
    ],
    "service": [
        {"sku": "DEMO-001", "name": "Yazılım Lisansı (Yıllık)", "category": "Lisans",      "price": 4800, "cost": 1200, "stock": 50,  "reorder": 5},
        {"sku": "DEMO-002", "name": "Danışmanlık Saati",        "category": "Hizmet",      "price": 800,  "cost": 300,  "stock": 200, "reorder": 10},
        {"sku": "DEMO-003", "name": "Teknik Destek Paketi",     "category": "Hizmet",      "price": 2400, "cost": 800,  "stock": 30,  "reorder": 5},
        {"sku": "DEMO-004", "name": "Eğitim Modülü (Online)",   "category": "Eğitim",      "price": 1200, "cost": 400,  "stock": 100, "reorder": 10},
        {"sku": "DEMO-005", "name": "Kurulum & Entegrasyon",    "category": "Hizmet",      "price": 3500, "cost": 1400, "stock": 20,  "reorder": 3},
    ],
    "production": [
        {"sku": "DEMO-001", "name": "Çelik Levha 2mm (m²)", "category": "Hammadde", "price": 380, "cost": 220, "stock": 500, "reorder": 100},
        {"sku": "DEMO-002", "name": "Alüminyum Profil 6m", "category": "Hammadde",  "price": 420, "cost": 250, "stock": 300, "reorder": 80},
        {"sku": "DEMO-003", "name": "Endüstriyel Boya (5L)","category": "Sarf",     "price": 280, "cost": 140, "stock": 150, "reorder": 40},
        {"sku": "DEMO-004", "name": "Civata Seti M8 (100lu)","category": "Sarf",    "price": 45,  "cost": 18,  "stock": 1000,"reorder": 200},
        {"sku": "DEMO-005", "name": "Makine Yedek Parçası", "category": "Parça",    "price": 950, "cost": 550, "stock": 25,  "reorder": 5},
    ],
    "construction": [
        {"sku": "DEMO-001", "name": "Çimento (50kg Torba)",  "category": "İnşaat",   "price": 280, "cost": 160, "stock": 400, "reorder": 100},
        {"sku": "DEMO-002", "name": "Demir Donatı 12mm",     "category": "İnşaat",   "price": 420, "cost": 280, "stock": 250, "reorder": 60},
        {"sku": "DEMO-003", "name": "Alçı (25kg)",           "category": "İnşaat",   "price": 95,  "cost": 45,  "stock": 300, "reorder": 80},
        {"sku": "DEMO-004", "name": "Boya + Astar Seti",     "category": "Boya",     "price": 350, "cost": 180, "stock": 120, "reorder": 30},
        {"sku": "DEMO-005", "name": "Elektrik Kablosu (100m)","category": "Elektrik","price": 520, "cost": 320, "stock": 80,  "reorder": 20},
    ],
}

_DEFAULT_PRODUCTS = _SECTOR_PRODUCTS["retail"]

_DEMO_CUSTOMERS = [
    {"name": "Anadolu Holding A.Ş.",   "type": "B2B"},
    {"name": "Tekno Çözümler Ltd.",    "type": "B2B"},
    {"name": "Yıldız İnşaat A.Ş.",    "type": "B2B"},
    {"name": "Mavi Lojistik Ltd.",     "type": "B2B"},
    {"name": "Güneş Enerji A.Ş.",     "type": "B2B"},
]


def seed_demo_data(db: Session, *, tenant_id: int, sector: str | None = None) -> None:
    """Tenant'a demo ürün, müşteri ve satış verisi ekler. Varsa atlar."""
    sector_key = sector or "retail"
    product_templates = _SECTOR_PRODUCTS.get(sector_key, _DEFAULT_PRODUCTS)

    # Ürünler
    products: list[Product] = []
    for tmpl in product_templates:
        existing = db.scalar(
            select(Product).where(Product.tenant_id == tenant_id, Product.sku == tmpl["sku"])
        )
        if existing:
            products.append(existing)
            continue

        p = Product(
            tenant_id=tenant_id,
            sku=tmpl["sku"],
            name=tmpl["name"],
            category=tmpl["category"],
            unit_price=Decimal(str(tmpl["price"])),
            cost_price=Decimal(str(tmpl["cost"])),
            stock_quantity=tmpl["stock"],
            reorder_level=tmpl["reorder"],
            tax_rate=Decimal("20.00"),
        )
        db.add(p)
        products.append(p)

    db.flush()

    # Stok giriş hareketi her ürün için
    for p in products:
        has_mov = db.scalar(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.product_id == p.id,
            )
        )
        if not has_mov:
            db.add(StockMovement(
                tenant_id=tenant_id,
                product_id=p.id,
                movement_type="in",
                change=p.stock_quantity,
                balance_after=p.stock_quantity,
                reference="DEMO-INIT",
                note="Demo veri başlangıç stoku",
            ))

    # Müşteriler
    customers: list[Customer] = []
    for cdata in _DEMO_CUSTOMERS:
        existing_c = db.scalar(
            select(Customer).where(
                Customer.tenant_id == tenant_id,
                Customer.name == cdata["name"],
                Customer.deleted_at.is_(None),
            )
        )
        if existing_c:
            customers.append(existing_c)
            continue
        c = Customer(
            tenant_id=tenant_id,
            name=cdata["name"],
            customer_type=cdata["type"],
        )
        db.add(c)
        customers.append(c)

    db.flush()

    # Satış kayıtları — son 45 gün içinde dağılmış
    today = date.today()
    record_no = 1000
    for i in range(15):
        sale_date = today - timedelta(days=random.randint(1, 45))
        customer = random.choice(customers)
        record_no += 1
        rec = SalesRecord(
            tenant_id=tenant_id,
            record_no=f"DEMO-{record_no}",
            sale_date=sale_date,
            customer_id=customer.id,
            customer_name=customer.name,
            total_amount=Decimal("0"),
        )
        db.add(rec)
        db.flush()

        # 1-3 ürün kalemi
        total = Decimal("0")
        for _ in range(random.randint(1, 3)):
            prod = random.choice(products)
            qty = random.randint(1, 5)
            line = prod.unit_price * qty
            tax = line * prod.tax_rate / Decimal("100")
            total += line
            db.add(SalesItem(
                tenant_id=tenant_id,
                sales_record_id=rec.id,
                product_id=prod.id,
                quantity=qty,
                unit_price=prod.unit_price,
                line_total=line,
                tax_rate=prod.tax_rate,
                tax_amount=tax,
                cost_price_snapshot=prod.cost_price,
            ))

        rec.total_amount = total

    db.commit()


def clear_demo_data(db: Session, *, tenant_id: int) -> None:
    """Tenant'ın tüm verilerini siler (demo temizleme)."""
    # Bağımlı tablolar sırasıyla: sales_items → sales_records → supply_orders → stock_movements → products → customers
    item_ids = db.scalars(
        select(SalesItem.id).join(SalesRecord).where(SalesRecord.tenant_id == tenant_id)
    ).all()
    if item_ids:
        db.execute(delete(SalesItem).where(SalesItem.id.in_(item_ids)))

    db.execute(delete(SalesRecord).where(SalesRecord.tenant_id == tenant_id))
    db.execute(delete(SupplyOrder).where(SupplyOrder.tenant_id == tenant_id))
    db.execute(delete(StockMovement).where(StockMovement.tenant_id == tenant_id))
    db.execute(delete(Product).where(Product.tenant_id == tenant_id))
    db.execute(delete(Customer).where(Customer.tenant_id == tenant_id))
    db.commit()
