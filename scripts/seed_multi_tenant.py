"""Multi-tenant demo seed — 4 ek şirket + sektöre özel veri.

Kullanım:
    python scripts/seed_multi_tenant.py

Ön koşul:
    alembic upgrade head          (tablolar mevcut olmalı)
    python scripts/seed_data.py   (tenant_id=1 retail verisi zaten dolu)

Yeniden çalıştırılabilir (idempotent): slug zaten varsa tenant atlanır.

Oluşturulan demo hesaplar:
    restaurant@demo.example.com / Manager12345
    service@demo.example.com    / Manager12345
    production@demo.example.com / Manager12345
    construction@demo.example.com / Manager12345
"""
from __future__ import annotations

import random
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.db import SessionLocal         # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.customer import Customer     # noqa: E402
from app.models.product import Product       # noqa: E402
from app.models.sales import SalesItem, SalesRecord  # noqa: E402
from app.models.tenant import Tenant         # noqa: E402
from app.models.user import User             # noqa: E402

DEMO_PASSWORD = "Manager12345"
TODAY = date.today()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _d(v: float | int) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.01"))


def _rand_date(days_back: int) -> date:
    return TODAY - timedelta(days=random.randint(0, days_back))


# ---------------------------------------------------------------------------
# Product specs
# ---------------------------------------------------------------------------

@dataclass
class PSpec:
    sku: str
    name: str
    category: str
    price: float
    cost: float
    stock: int = 100
    reorder: int = 20


# ---------------------------------------------------------------------------
# Sector definitions
# ---------------------------------------------------------------------------

@dataclass
class TenantDef:
    slug: str
    name: str
    sector: str
    active_modules: list[str]
    manager_email: str
    products: list[PSpec]
    customers: list[str]
    sales_days: int
    sales_per_day: tuple[int, int]   # (min, max) satış sayısı / gün
    qty_range: tuple[int, int]       # (min, max) satış kalemi adeti
    extra_employees: list[tuple[str, str]] = field(default_factory=list)  # (email, full_name)


TENANT_DEFS: list[TenantDef] = [
    # -------------------------------------------------------------------
    # Lezzet Dünyası — Restoran
    # -------------------------------------------------------------------
    TenantDef(
        slug="lezzet-dunyasi",
        name="Lezzet Dünyası",
        sector="restaurant",
        active_modules=["sales", "inventory", "finance", "suppliers", "ai"],
        manager_email="restaurant@demo.example.com",
        products=[
            PSpec("LZ-001", "Klasik Burger",        "Ana Yemek",  150.00,  55.00, 200, 30),
            PSpec("LZ-002", "Çift Köfteli Burger",  "Ana Yemek",  220.00,  80.00, 150, 25),
            PSpec("LZ-003", "Izgara Tavuk",         "Ana Yemek",  180.00,  60.00, 180, 25),
            PSpec("LZ-004", "Karışık Pizza",        "Pizza",      200.00,  70.00, 160, 25),
            PSpec("LZ-005", "Margarita Pizza",      "Pizza",      170.00,  55.00, 140, 20),
            PSpec("LZ-006", "Pepperoni Pizza",      "Pizza",      210.00,  75.00, 130, 20),
            PSpec("LZ-007", "Sezar Salata",         "Salata",      90.00,  25.00, 250, 40),
            PSpec("LZ-008", "Akdeniz Salata",       "Salata",      80.00,  22.00, 230, 35),
            PSpec("LZ-009", "Patates Kızartması",   "Yan Ürün",    60.00,  15.00, 400, 60),
            PSpec("LZ-010", "Soğan Halkaları",      "Yan Ürün",    55.00,  13.00, 350, 50),
            PSpec("LZ-011", "Cola 330ml",           "İçecek",      35.00,   8.00, 500, 80),
            PSpec("LZ-012", "Ayran",                "İçecek",      25.00,   5.00, 400, 70),
            PSpec("LZ-013", "Limonata",             "İçecek",      40.00,  10.00, 300, 50),
            PSpec("LZ-014", "Çikolatalı Brownie",   "Tatlı",       75.00,  20.00, 200, 30),
            PSpec("LZ-015", "Cheesecake",           "Tatlı",       85.00,  25.00, 150, 25),
        ],
        customers=[
            "Ali Yıldız", "Fatma Kaya", "Mehmet Demir", "Ayşe Şahin", "Hüseyin Çelik",
            "Zeynep Arslan", "Mustafa Koç", "Elif Aydın", "İbrahim Kurt", "Selin Yıldırım",
            "Berk Özkan", "Ceren Doğan", "Taner Aktaş", "Pınar Güler", "Onur Çetin",
            "Yemek Sepeti İş Ortağı", "Getir Restoran", "Şirket Yemeği A.Ş.",
        ],
        sales_days=180,
        sales_per_day=(8, 25),
        qty_range=(1, 4),
        extra_employees=[
            ("kasiyer@lezzet.demo.example.com", "Kasiyer Deniz"),
            ("garson@lezzet.demo.example.com", "Garson Emre"),
        ],
    ),

    # -------------------------------------------------------------------
    # Tekno Çözümler — Hizmet / Danışmanlık
    # -------------------------------------------------------------------
    TenantDef(
        slug="tekno-cozumler",
        name="Tekno Çözümler",
        sector="service",
        active_modules=["finance", "crm", "hr", "ai"],
        manager_email="service@demo.example.com",
        products=[
            PSpec("TK-001", "ERP Danışmanlık (günlük)",  "Danışmanlık",  5000.00, 1800.00,  50, 5),
            PSpec("TK-002", "IT Altyapı Kurulumu",       "Proje",       15000.00, 6000.00,  30, 3),
            PSpec("TK-003", "Yazılım Lisansı (yıllık)",  "Lisans",       8000.00, 2500.00,  40, 5),
            PSpec("TK-004", "Siber Güvenlik Denetimi",   "Güvenlik",    12000.00, 4500.00,  20, 2),
            PSpec("TK-005", "Veri Analizi Raporu",       "Analitik",     7500.00, 2800.00,  25, 3),
            PSpec("TK-006", "Bulut Geçiş Hizmeti",       "Proje",       20000.00, 8000.00,  15, 2),
            PSpec("TK-007", "Teknik Destek (aylık)",     "Destek",       3500.00, 1200.00,  60, 8),
            PSpec("TK-008", "Eğitim Paketi (5 kişi)",   "Eğitim",       6000.00, 2000.00,  20, 3),
            PSpec("TK-009", "API Entegrasyon Hizmeti",   "Geliştirme",  10000.00, 3800.00,  15, 2),
            PSpec("TK-010", "Proje Yönetimi (aylık)",    "Danışmanlık",  9000.00, 3200.00,  20, 3),
        ],
        customers=[
            "Anadolu Holding A.Ş.", "Global Finans Ltd.", "Tekno İmalat San.",
            "Sağlık Grubu A.Ş.", "Lojistik Plus Ltd.", "Medikal Cihazlar A.Ş.",
            "Eğitim Vakfı", "Perakende Zincir A.Ş.", "İnşaat Holding",
            "Tarım Kooperatifi", "Turizm Grubu Ltd.", "Enerji Şirketi A.Ş.",
        ],
        sales_days=270,
        sales_per_day=(0, 2),
        qty_range=(1, 3),
        extra_employees=[
            ("konsultan@tekno.demo.example.com", "Danışman Bora"),
            ("pm@tekno.demo.example.com", "Proje Müdürü Selin"),
        ],
    ),

    # -------------------------------------------------------------------
    # Makine Pro — Üretim
    # -------------------------------------------------------------------
    TenantDef(
        slug="makine-pro",
        name="Makine Pro",
        sector="production",
        active_modules=["inventory", "purchasing", "finance", "suppliers", "hr", "ai"],
        manager_email="production@demo.example.com",
        products=[
            PSpec("MP-001", "Çelik Boru 50mm (mt)",       "Hammadde",    120.00,  45.00, 5000, 500),
            PSpec("MP-002", "Alüminyum Profil 30x30 (mt)", "Hammadde",   95.00,   35.00, 3000, 300),
            PSpec("MP-003", "Endüstriyel Rulman 6204",    "Yedek Parça",  85.00,  28.00, 2000, 200),
            PSpec("MP-004", "Hidrolik Silindir 100mm",    "Yedek Parça", 850.00, 320.00,  300,  30),
            PSpec("MP-005", "Elektrik Motoru 7.5kW",      "Ekipman",    4500.00,1800.00,   80,   8),
            PSpec("MP-006", "CNC Kesici Takım Seti",      "Alet",       1200.00, 480.00,  150,  15),
            PSpec("MP-007", "Yarı Mamul Şasi (adet)",     "Yarı Mamul", 2800.00,1100.00,   60,   6),
            PSpec("MP-008", "Endüstriyel Kaynak Teli",    "Sarf",        350.00, 120.00, 1000, 100),
            PSpec("MP-009", "Pnömatik Piston 80mm",       "Yedek Parça", 420.00, 150.00,  400,  40),
            PSpec("MP-010", "Kompresör Filtresi",         "Sarf",        180.00,  55.00,  800,  80),
            PSpec("MP-011", "Bant Konveyör Modülü",       "Ekipman",    7500.00,2900.00,   25,   3),
            PSpec("MP-012", "Plastik Enjeksiyon Kalıp",   "Kalıp",      9800.00,3800.00,   15,   2),
        ],
        customers=[
            "Otomotiv San. A.Ş.", "Beyaz Eşya Üretim Ltd.", "Savunma Sanayi A.Ş.",
            "Tarım Makineleri Ltd.", "İnşaat Ekipman A.Ş.", "Ambalaj San. Ltd.",
            "Tekstil Makineleri A.Ş.", "Enerji Ekipman Ltd.",
        ],
        sales_days=270,
        sales_per_day=(1, 4),
        qty_range=(5, 50),
        extra_employees=[
            ("uretim@makine.demo.example.com", "Üretim Sorumlusu Kemal"),
            ("kalite@makine.demo.example.com", "Kalite Kontrol Nilüfer"),
        ],
    ),

    # -------------------------------------------------------------------
    # İnşaat A.Ş. — İnşaat
    # -------------------------------------------------------------------
    TenantDef(
        slug="insaat-as",
        name="İnşaat A.Ş.",
        sector="construction",
        active_modules=["purchasing", "finance", "hr", "suppliers", "ai"],
        manager_email="construction@demo.example.com",
        products=[
            PSpec("IN-001", "Portland Çimentosu (50kg)",  "Yapı Malz.",   150.00,  55.00, 2000, 200),
            PSpec("IN-002", "Hazır Beton C25 (m³)",       "Yapı Malz.",   800.00, 320.00,  500,  50),
            PSpec("IN-003", "İnşaat Demiri Φ12 (ton)",    "Demir-Çelik", 8500.00,3500.00,  100,  10),
            PSpec("IN-004", "İnşaat Demiri Φ16 (ton)",    "Demir-Çelik", 9200.00,3800.00,   80,   8),
            PSpec("IN-005", "Tuğla (1000 adet)",          "Yapı Malz.",   850.00, 320.00,  300,  30),
            PSpec("IN-006", "OSB Levha 18mm",             "Ahşap",        380.00, 140.00,  500,  50),
            PSpec("IN-007", "Isı Yalıtım Levhası (m²)",  "Yalıtım",      180.00,  65.00, 1000, 100),
            PSpec("IN-008", "Su Yalıtım Membranı (m²)",  "Yalıtım",      280.00, 100.00,  600,  60),
            PSpec("IN-009", "Elektrik Borusu (mt)",       "Tesisat",       45.00,  15.00, 5000, 500),
            PSpec("IN-010", "PVC Boru 110mm (mt)",        "Tesisat",       85.00,  30.00, 2000, 200),
            PSpec("IN-011", "Alüminyum Doğrama (m²)",     "Doğrama",      650.00, 250.00,  200,  20),
            PSpec("IN-012", "İş Güvenliği Kiti",          "Güvenlik",     350.00, 120.00,  400,  40),
        ],
        customers=[
            "Proje İnşaat Yönetimi Ltd.", "Konut Yapı A.Ş.", "Altyapı Müteahhit Ltd.",
            "Okul İnşaat Projesi", "Hastane Yapım A.Ş.", "Yol Yapım Ltd.",
            "Fabrika İnşaat Projesi", "AVM Yapım A.Ş.",
        ],
        sales_days=365,
        sales_per_day=(1, 3),
        qty_range=(10, 100),
        extra_employees=[
            ("santiye@insaat.demo.example.com", "Şantiye Şefi Cengiz"),
            ("muhasebe@insaat.demo.example.com", "Muhasebe Sorumlusu Aylin"),
        ],
    ),
]


# ---------------------------------------------------------------------------
# Core seeding logic
# ---------------------------------------------------------------------------

def _get_or_create_tenant(db: Session, tdef: TenantDef) -> Tenant | None:
    existing = db.scalar(select(Tenant).where(Tenant.slug == tdef.slug))
    if existing:
        print(f"  [SKIP] Tenant '{tdef.slug}' zaten mevcut (id={existing.id})")
        return None

    tenant = Tenant(
        name=tdef.name,
        slug=tdef.slug,
        is_active=True,
        sector=tdef.sector,
        onboarding_completed=True,
    )
    tenant.active_modules = tdef.active_modules
    db.add(tenant)
    db.flush()
    print(f"  [OK]   Tenant '{tdef.name}' oluşturuldu (id={tenant.id})")
    return tenant


def _create_manager(db: Session, tenant: Tenant, tdef: TenantDef) -> None:
    exists = db.scalar(select(User.id).where(User.email == tdef.manager_email))
    if exists:
        return
    db.add(User(
        tenant_id=tenant.id,
        email=tdef.manager_email,
        password_hash=hash_password(DEMO_PASSWORD),
        full_name=f"{tdef.name} Müdürü",
        department="Yönetim",
        role="manager",
        is_active=True,
    ))


def _create_employees(db: Session, tenant: Tenant, tdef: TenantDef) -> None:
    for email, full_name in tdef.extra_employees:
        exists = db.scalar(select(User.id).where(User.email == email))
        if exists:
            continue
        db.add(User(
            tenant_id=tenant.id,
            email=email,
            password_hash=hash_password(DEMO_PASSWORD),
            full_name=full_name,
            department="Operasyon",
            role="employee",
            is_active=True,
        ))


def _create_products(db: Session, tenant: Tenant, tdef: TenantDef) -> list[Product]:
    products = []
    for spec in tdef.products:
        existing = db.scalar(
            select(Product).where(Product.tenant_id == tenant.id, Product.sku == spec.sku)
        )
        if existing:
            products.append(existing)
            continue
        p = Product(
            tenant_id=tenant.id,
            sku=spec.sku,
            name=spec.name,
            category=spec.category,
            unit_price=_d(spec.price),
            cost_price=_d(spec.cost),
            stock_quantity=spec.stock,
            reorder_level=spec.reorder,
        )
        db.add(p)
        products.append(p)
    db.flush()
    return products


def _create_customers(db: Session, tenant: Tenant, tdef: TenantDef) -> list[str]:
    for name in tdef.customers:
        existing = db.scalar(
            select(Customer.id).where(Customer.tenant_id == tenant.id, Customer.name == name)
        )
        if existing:
            continue
        db.add(Customer(tenant_id=tenant.id, name=name, customer_type="B2B"))
    return tdef.customers


def _create_sales(
    db: Session,
    tenant: Tenant,
    tdef: TenantDef,
    products: list[Product],
) -> None:
    if not products:
        return

    rng = random.Random(tenant.id * 42)

    for day_offset in range(tdef.sales_days, 0, -1):
        sale_date = TODAY - timedelta(days=day_offset)
        num_sales = rng.randint(*tdef.sales_per_day)

        for sale_idx in range(num_sales):
            record_no = f"{tdef.slug.upper()[:4]}-{sale_date.strftime('%Y%m%d')}-{sale_idx+1:03d}"
            exists = db.scalar(
                select(SalesRecord.id).where(
                    SalesRecord.tenant_id == tenant.id,
                    SalesRecord.record_no == record_no,
                )
            )
            if exists:
                continue

            customer = rng.choice(tdef.customers)
            num_items = rng.randint(1, 3)
            selected = rng.sample(products, min(num_items, len(products)))

            record = SalesRecord(
                tenant_id=tenant.id,
                record_no=record_no,
                sale_date=sale_date,
                customer_name=customer,
                total_amount=_d(0),
            )
            db.add(record)
            db.flush()

            total = Decimal("0")
            for product in selected:
                qty = rng.randint(*tdef.qty_range)
                price = product.unit_price
                line = _d(float(price) * qty)
                total += line
                db.add(SalesItem(
                    tenant_id=tenant.id,
                    sales_record_id=record.id,
                    product_id=product.id,
                    quantity=qty,
                    unit_price=price,
                    line_total=line,
                ))

            record.total_amount = total


def seed_tenant(db: Session, tdef: TenantDef) -> None:
    print(f"\n=== {tdef.name} ({tdef.sector}) ===")
    tenant = _get_or_create_tenant(db, tdef)
    if tenant is None:
        return
    _create_manager(db, tenant, tdef)
    _create_employees(db, tenant, tdef)
    products = _create_products(db, tenant, tdef)
    _create_customers(db, tenant, tdef)
    _create_sales(db, tenant, tdef, products)
    db.commit()
    print(f"  [OK]   {len(products)} ürün, {len(tdef.customers)} müşteri, ~{tdef.sales_days * ((tdef.sales_per_day[0]+tdef.sales_per_day[1])//2)} satış kaydı")


def main() -> None:
    print("Future ERP — Multi-Tenant Seed")
    print("=" * 40)
    db: Session = SessionLocal()
    try:
        for tdef in TENANT_DEFS:
            seed_tenant(db, tdef)
        print("\nTamamlandi! Admin panelinde 5 sirket gorunmeli.")
    except Exception as exc:
        db.rollback()
        print(f"\nHata: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
