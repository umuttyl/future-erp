"""Modül konfigürasyonu ve sektör şablonları.

Her modül bir ERP fonksiyon alanını temsil eder.
Sektör şablonları onboarding sırasında varsayılan aktif modülleri belirler.
Manager istediği zaman modülleri açıp kapatabilir.
"""
from __future__ import annotations

from typing import FrozenSet

# ---------------------------------------------------------------------------
# Modül tanımları
# ---------------------------------------------------------------------------

class ModuleKey:
    """Modül anahtar sabitleri — tip güvenli kullanım için."""
    SALES      = "sales"       # Satış yönetimi
    INVENTORY  = "inventory"   # Stok / envanter
    FINANCE    = "finance"     # Finans / muhasebe
    CASHBOOK   = "cashbook"    # Kasa & banka hesapları
    CRM        = "crm"         # Müşteri yönetimi
    SUPPLIERS  = "suppliers"   # Tedarikçi yönetimi
    PURCHASING = "purchasing"  # Satınalma / sipariş
    HR         = "hr"          # İnsan kaynakları
    AI         = "ai"          # AI analiz / chatbot / tahmin


ALL_MODULES: FrozenSet[str] = frozenset(
    {
        ModuleKey.SALES,
        ModuleKey.INVENTORY,
        ModuleKey.FINANCE,
        ModuleKey.CASHBOOK,
        ModuleKey.CRM,
        ModuleKey.SUPPLIERS,
        ModuleKey.PURCHASING,
        ModuleKey.HR,
        ModuleKey.AI,
    }
)

# Her modül için Türkçe etiket ve ikon bilgisi (frontend için)
MODULE_META: dict[str, dict] = {
    ModuleKey.SALES:      {"label": "Sales Management",   "icon": "ShoppingCart", "description": "Sales records, daily revenue, customer-based sales"},
    ModuleKey.INVENTORY:  {"label": "Stock Tracking",     "icon": "Package",      "description": "Product stock levels, movements, critical stock alerts"},
    ModuleKey.FINANCE:    {"label": "Finance",            "icon": "TrendingUp",   "description": "Income/expense tracking, monthly trends, financial summary"},
    ModuleKey.CASHBOOK:   {"label": "Cash & Bank",        "icon": "Landmark",     "description": "Cash and bank accounts, cash in/out tracking"},
    ModuleKey.CRM:        {"label": "Customer Management","icon": "Users",        "description": "Customer records, contact details, sales history"},
    ModuleKey.SUPPLIERS:  {"label": "Suppliers",          "icon": "Truck",        "description": "Supplier details, purchase history, payment terms"},
    ModuleKey.PURCHASING: {"label": "Purchasing / Orders","icon": "ClipboardList","description": "Supply orders, approval processes, delivery tracking"},
    ModuleKey.HR:         {"label": "Human Resources",    "icon": "UserCheck",    "description": "Employee records, performance evaluation"},
    ModuleKey.AI:         {"label": "AI Assistant",       "icon": "Zap",          "description": "AI analysis, chatbot, anomaly detection, sales forecast"},
}

# ---------------------------------------------------------------------------
# Sektör şablonları
# ---------------------------------------------------------------------------

class SectorKey:
    RETAIL       = "retail"       # Perakende / Market
    RESTAURANT   = "restaurant"   # Restoran / Kafe
    SERVICE      = "service"      # Hizmet sektörü
    PRODUCTION   = "production"   # Üretim / Atölye
    CONSTRUCTION = "construction" # İnşaat / Müteahhit
    OTHER        = "other"        # Diğer (manuel seçim)


SECTOR_TEMPLATES: dict[str, list[str]] = {
    SectorKey.RETAIL: [
        ModuleKey.SALES,
        ModuleKey.INVENTORY,
        ModuleKey.FINANCE,
        ModuleKey.CASHBOOK,
        ModuleKey.CRM,
        ModuleKey.SUPPLIERS,
        ModuleKey.PURCHASING,
        ModuleKey.AI,
    ],
    SectorKey.RESTAURANT: [
        ModuleKey.SALES,
        ModuleKey.INVENTORY,
        ModuleKey.FINANCE,
        ModuleKey.CASHBOOK,
        ModuleKey.SUPPLIERS,
        ModuleKey.AI,
    ],
    SectorKey.SERVICE: [
        ModuleKey.FINANCE,
        ModuleKey.CASHBOOK,
        ModuleKey.CRM,
        ModuleKey.HR,
        ModuleKey.AI,
    ],
    SectorKey.PRODUCTION: [
        ModuleKey.INVENTORY,
        ModuleKey.PURCHASING,
        ModuleKey.FINANCE,
        ModuleKey.CASHBOOK,
        ModuleKey.SUPPLIERS,
        ModuleKey.HR,
        ModuleKey.AI,
    ],
    SectorKey.CONSTRUCTION: [
        ModuleKey.PURCHASING,
        ModuleKey.FINANCE,
        ModuleKey.CASHBOOK,
        ModuleKey.HR,
        ModuleKey.SUPPLIERS,
        ModuleKey.AI,
    ],
    SectorKey.OTHER: list(ALL_MODULES),  # Tümü aktif — manuel seçim yapacak
}

SECTOR_META: dict[str, dict] = {
    SectorKey.RETAIL:       {"label": "Retail / Market",        "icon": "Store",       "description": "Market, grocery, clothing, electronics store"},
    SectorKey.RESTAURANT:   {"label": "Restaurant / Café",      "icon": "Coffee",      "description": "Restaurant, café, patisserie, food businesses"},
    SectorKey.SERVICE:      {"label": "Service Industry",       "icon": "Briefcase",   "description": "Consulting, cleaning, beauty salon, repair shop"},
    SectorKey.PRODUCTION:   {"label": "Manufacturing / Workshop","icon": "Factory",    "description": "Small factory, workshop, assembly unit"},
    SectorKey.CONSTRUCTION: {"label": "Construction / Contractor","icon": "HardHat",   "description": "Contractor, renovation, building materials"},
    SectorKey.OTHER:        {"label": "Other",                  "icon": "Settings",    "description": "Choose the modules that fit your sector yourself"},
}

# ---------------------------------------------------------------------------
# Yardımcı fonksiyonlar
# ---------------------------------------------------------------------------

def get_default_modules(sector: str) -> list[str]:
    """Sektöre göre varsayılan aktif modül listesini döner."""
    return SECTOR_TEMPLATES.get(sector, list(ALL_MODULES))


def validate_modules(modules: list[str]) -> list[str]:
    """Gelen modül listesinden sadece geçerli olanları filtreler."""
    return [m for m in modules if m in ALL_MODULES]


def is_module_active(active_modules: list[str], module: str) -> bool:
    """Belirli bir modülün aktif olup olmadığını kontrol eder."""
    return module in active_modules


# NLP / AI için role bazında hangi tablolara erişileceğini belirler.
# Modül → NLP'nin doğrudan SQL sorgulayabileceği tablolar eşlemesi.
#
# FINANCE ve HR neden BOŞ? (tasarım kararı — eksiklik değil)
# ──────────────────────────────────────────────────────────────────────────
#   FINANCE: Ayrı bir `finance_records` tablosu YOKTUR. Finans verisi
#            (ciro, kâr, gider) `sales_records` + `sales_items` + `cash_*` +
#            `account_movements` üzerinden HESAPLANIR (finance_service.py).
#            Bu yüzden NLP finansı doğrudan tek tablodan sorgulayamaz; finansal
#            sorular SALES/CASHBOOK tablolarına ve servis hesaplamalarına dayanır.
#   HR:      Ayrı bir `employees` tablosu YOKTUR. Çalışanlar `users` tablosunda
#            (role_kind='staff') tutulur; performans `sales_records.created_by_user_id`
#            üzerinden hesaplanır (hr_performance_service.py). `users` admin NLP
#            whitelist'inde (_ADMIN_EXTRA_TABLES) ayrıca yönetilir.
# Sonuç: Bu iki modülün boş olması bilinçlidir; "hayalet tablo" referansı (P0-2)
# yeniden oluşmasın diye tablo eklenmemiştir. Faz 4'te ayrı finans/HR tabloları
# eklenirse buraya eklenecektir.
MODULE_TABLE_MAP: dict[str, list[str]] = {
    ModuleKey.SALES:      ["sales_records", "sales_items"],
    ModuleKey.INVENTORY:  ["stock_movements"],        # "inventory_items" yok; stok products + stock_movements
    ModuleKey.FINANCE:    [],                         # bilinçli boş — yukarıdaki nota bakın (hesaplanan veri)
    ModuleKey.CRM:        ["customers"],
    ModuleKey.SUPPLIERS:  ["suppliers"],
    ModuleKey.PURCHASING: ["supply_orders"],
    ModuleKey.HR:         [],                         # bilinçli boş — yukarıdaki nota bakın (users + hesaplama)
    ModuleKey.AI:         ["sales_forecast_results"],
}


def allowed_tables_for_modules(active_modules: list[str]) -> list[str]:
    """Aktif modüllere göre erişilebilir tablo listesini döner (NLP için)."""
    tables: list[str] = ["products"]  # products her zaman erişilebilir
    for module in active_modules:
        tables.extend(MODULE_TABLE_MAP.get(module, []))
    return list(dict.fromkeys(tables))  # Duplicate'leri koru sırayı koru
