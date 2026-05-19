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
        ModuleKey.CRM,
        ModuleKey.SUPPLIERS,
        ModuleKey.PURCHASING,
        ModuleKey.HR,
        ModuleKey.AI,
    }
)

# Her modül için Türkçe etiket ve ikon bilgisi (frontend için)
MODULE_META: dict[str, dict] = {
    ModuleKey.SALES:      {"label": "Satış Yönetimi",     "icon": "ShoppingCart", "description": "Satış kayıtları, günlük ciro, müşteri bazlı satışlar"},
    ModuleKey.INVENTORY:  {"label": "Stok Takibi",        "icon": "Package",      "description": "Ürün stok seviyeleri, hareketler, kritik stok uyarıları"},
    ModuleKey.FINANCE:    {"label": "Finans",              "icon": "TrendingUp",   "description": "Gelir/gider takibi, aylık trendler, finansal özet"},
    ModuleKey.CRM:        {"label": "Müşteri Yönetimi",   "icon": "Users",        "description": "Müşteri kayıtları, iletişim bilgileri, satış geçmişi"},
    ModuleKey.SUPPLIERS:  {"label": "Tedarikçi",          "icon": "Truck",        "description": "Tedarikçi bilgileri, alım geçmişi, ödeme koşulları"},
    ModuleKey.PURCHASING: {"label": "Satınalma / Sipariş","icon": "ClipboardList","description": "Tedarik siparişleri, onay süreçleri, teslimat takibi"},
    ModuleKey.HR:         {"label": "İnsan Kaynakları",   "icon": "UserCheck",    "description": "Çalışan bilgileri, performans değerlendirme"},
    ModuleKey.AI:         {"label": "AI Asistan",         "icon": "Zap",          "description": "Yapay zeka analizi, chatbot, anomali tespiti, satış tahmini"},
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
        ModuleKey.CRM,
        ModuleKey.SUPPLIERS,
        ModuleKey.PURCHASING,
        ModuleKey.AI,
    ],
    SectorKey.RESTAURANT: [
        ModuleKey.SALES,
        ModuleKey.INVENTORY,
        ModuleKey.FINANCE,
        ModuleKey.SUPPLIERS,
        ModuleKey.AI,
    ],
    SectorKey.SERVICE: [
        ModuleKey.FINANCE,
        ModuleKey.CRM,
        ModuleKey.HR,
        ModuleKey.AI,
    ],
    SectorKey.PRODUCTION: [
        ModuleKey.INVENTORY,
        ModuleKey.PURCHASING,
        ModuleKey.FINANCE,
        ModuleKey.SUPPLIERS,
        ModuleKey.HR,
        ModuleKey.AI,
    ],
    SectorKey.CONSTRUCTION: [
        ModuleKey.PURCHASING,
        ModuleKey.FINANCE,
        ModuleKey.HR,
        ModuleKey.SUPPLIERS,
        ModuleKey.AI,
    ],
    SectorKey.OTHER: list(ALL_MODULES),  # Tümü aktif — manuel seçim yapacak
}

SECTOR_META: dict[str, dict] = {
    SectorKey.RETAIL:       {"label": "Perakende / Market",   "icon": "Store",       "description": "Market, bakkal, giyim, elektronik mağazası"},
    SectorKey.RESTAURANT:   {"label": "Restoran / Kafe",      "icon": "Coffee",      "description": "Restoran, kafe, pastane, yemek işletmeleri"},
    SectorKey.SERVICE:      {"label": "Hizmet Sektörü",       "icon": "Briefcase",   "description": "Danışmanlık, temizlik, güzellik salonu, tamirhane"},
    SectorKey.PRODUCTION:   {"label": "Üretim / Atölye",      "icon": "Factory",     "description": "Küçük imalathane, atölye, montaj birimi"},
    SectorKey.CONSTRUCTION: {"label": "İnşaat / Müteahhit",   "icon": "HardHat",    "description": "Müteahhit, tadilat, yapı malzemeleri"},
    SectorKey.OTHER:        {"label": "Diğer",                "icon": "Settings",    "description": "Sektörünüze uygun modülleri kendiniz seçin"},
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
# Modül → izin verilen SQL tabloları eşlemesi.
MODULE_TABLE_MAP: dict[str, list[str]] = {
    ModuleKey.SALES:      ["sales_records", "sales_items"],
    ModuleKey.INVENTORY:  ["stock_movements"],        # "inventory_items" yok
    ModuleKey.FINANCE:    [],                         # finance_records yok (Faz 2)
    ModuleKey.CRM:        ["customers"],
    ModuleKey.SUPPLIERS:  ["suppliers"],
    ModuleKey.PURCHASING: ["supply_orders"],
    ModuleKey.HR:         [],                         # employees yok (Faz 2)
    ModuleKey.AI:         ["sales_forecast_results"],
}


def allowed_tables_for_modules(active_modules: list[str]) -> list[str]:
    """Aktif modüllere göre erişilebilir tablo listesini döner (NLP için)."""
    tables: list[str] = ["products"]  # products her zaman erişilebilir
    for module in active_modules:
        tables.extend(MODULE_TABLE_MAP.get(module, []))
    return list(dict.fromkeys(tables))  # Duplicate'leri koru sırayı koru
