# Future ERP — ACTION PLAN

> Bu dosya `PROJECT_AUDIT_REPORT.md`'deki bulguları **Claude Code'un çalıştırabileceği adım-adım fix talimatlarına** çevirir.
>
> **Kullanım:** Yeni sohbet aç → şu mesajı gönder:
>
> > "@AGENTS.md, @.cursor/PROGRESS.md ve @.cursor/ACTION_PLAN.md oku. ACTION_PLAN içindeki **P0-1** numaralı görevle başla; her adım sonunda `pytest tests/` çalıştır ve sonucu raporla. Tamamlanan görevi `[ ]` → `[x]` olarak işaretle. Bir görev biterse bana onay isteme, sırayla bir sonrakine geç. P0 grubu bitince dur."
>
> **Görev numaralandırması:** `<Öncelik>-<sıra>` (örn. `P0-1`, `P1-3`).
> **Her görevde:** dosya yolu (mutlak proje kökü göreceli), satır numarası (mevcut state), before/after kod, kabul kriteri, test komutu.
>
> **Acceptance kuralları (her görev için ortak):**
> 1. Mevcut testler kırılmamalı (`pytest -x` geçmeli).
> 2. Yeni davranış için **en az bir test** eklenmiş olmalı.
> 3. Conventional Commit ile küçük commit at: `fix(<scope>): <açıklama> (ACTION_PLAN P0-X)`.
> 4. Tamamlanınca bu dosyada checkbox işaretle.

---

## Önkoşul — Ortam doğrula

Hiçbir göreve başlamadan önce:

```powershell
# 1. Sanal ortam aktif mi?
.\.venv\Scripts\Activate.ps1

# 2. Bağımlılıklar yüklü mü?
pip install -r requirements.txt -r requirements-dev.txt

# 3. Migration güncel mi?
alembic upgrade head

# 4. Mevcut testler geçiyor mu? (BASELINE — düzeltmeden önce kayıt al)
pytest -q
```

**Eğer baseline'da kırık test varsa:** önce onu kayda al; ACTION_PLAN sırasında "x yeni test kırıldı" derken bunları sayma.

---

## P0 — Acil müdahale (production-blocker bug'lar)

> Bu 5 görev **bitirilmeden** demo/deploy yapma. Sıra önemli: önce model temizliği (P0-2), sonra ham SQL fix (P0-3), sonra WS, sonra NLP.

### [x] P0-1 — WebSocket multi-tenant veri sızıntısını kapat

**Dosya:** `app/api/routes/ws_notifications.py`  
**Satır:** ~35  
**Hata:** JWT payload'unda `tid` anahtarı varken kod `tenant_id` okumaya çalışıyor; her zaman `None` döner, `tenant_id = 1` (admin tenant) fallback'i devreye girer → **tüm WS bildirimi admin tenant'a sızar**.

**Before:**
```python
tenant_id = int(payload.get("tenant_id") or 1)
```

**After:**
```python
tid_raw = payload.get("tid")
if tid_raw is None:
    await websocket.close(code=1008, reason="tenant kimliği yok")
    return
try:
    tenant_id = int(tid_raw)
    if tenant_id <= 0:
        raise ValueError
except (TypeError, ValueError):
    await websocket.close(code=1008, reason="geçersiz tenant kimliği")
    return
```

**Kabul kriteri:**
- Geçerli access token + `tid=2` ile bağlanılır; broadcast yalnızca tenant 2'ye gider.
- `tid` yok / 0 / negatif olunca WS 1008 ile kapanır.

**Yeni test (`tests/test_ws_notifications.py` oluştur):**
```python
def test_ws_uses_tid_not_tenant_id(monkeypatch, db_session, test_tenant, test_admin):
    """JWT 'tid' anahtarı doğru okunmalı; admin fallback yok."""
    from app.core.security import create_access_token
    token = create_access_token(
        user_id=test_admin.id,
        tenant_id=test_tenant.id,
        role="admin",
        email=test_admin.email,
    )
    # decode + assert
    from app.core.security import decode_access_token
    payload = decode_access_token(token)
    assert payload["tid"] == test_tenant.id
    assert "tenant_id" not in payload  # eski yanlış anahtar yok

def test_ws_rejects_token_without_tid():
    # Manuel payload üret, tid'siz JWT → bağlantı reddedilmeli
    ...
```

**Verifikasyon:**
```powershell
pytest tests/test_ws_notifications.py -v
```

**Commit:**
```
fix(ws): use 'tid' JWT claim instead of missing 'tenant_id' (ACTION_PLAN P0-1)
```

---

### [x] P0-2 — Hayalet tabloları temizle (`finance_records`, `employees`)

**Sorun:** Bu iki tablo `anomaly_service.py`, `nlp_assistant.py` ve `module_config.py`'da geçiyor ama **model yok, migration yok**. Runtime'da `OperationalError: no such table`.

**Karar (önerilen):** `B) Referansları temizle`. Finans verisi zaten `sales_records + sales_items` üzerinden hesaplanıyor; `employees` modülü Faz 2'ye ertelendi. **Model eklemek yerine bu iki tablonun tüm referanslarını kaldır.**

**Yapılacak değişiklikler:**

#### 2a. `app/services/anomaly_service.py`
`detect_finance_anomalies` fonksiyonunu **tamamen sil** veya `pass`'lat:
```python
def detect_finance_anomalies(db: Session, *, tenant_id: int) -> list[AnomalyResult]:
    """finance_records tablosu yok — Faz 2'de Finance modülü eklenince yeniden yazılacak."""
    return []
```

`run_all_anomaly_checks` içinden `extend(detect_finance_anomalies(...))` satırını ya tut (boş döner) ya da yorum satırına çek + TODO yaz:
```python
# TODO(faz-2): detect_finance_anomalies — finance_records modeli eklenince aç
# results.extend(detect_finance_anomalies(db, tenant_id=tenant_id))
```

#### 2b. `app/core/module_config.py` (satır 139, 143)
`MODULE_TABLE_MAP`'ten kaldır veya boş listeye eşitle:
```python
MODULE_TABLE_MAP: dict[str, list[str]] = {
    ModuleKey.SALES:      ["sales_records", "sales_items"],
    ModuleKey.INVENTORY:  ["stock_movements"],   # "inventory_items" yok, kaldır
    ModuleKey.FINANCE:    [],                    # finance_records yok
    ModuleKey.CRM:        ["customers"],
    ModuleKey.SUPPLIERS:  ["suppliers"],
    ModuleKey.PURCHASING: ["supply_orders"],
    ModuleKey.HR:         [],                    # employees yok
    ModuleKey.AI:         ["sales_forecast_results"],
}
```

> **Dikkat:** `INVENTORY` için orijinalde `"inventory_items"` de yazıyor — bu tablo da yok. Aynı temizliği yap.

#### 2c. `app/services/nlp_assistant.py`

- `_ADMIN_ALL_TABLES` setinden `"finance_records"` ve `"employees"` çıkar (satır ~37-41).
- `_unified_nlp_system_prompt` içindeki schema bloğunda (satır ~244-274) `Table: finance_records` ve `Table: employees` bloklarını sil.
- `Table: stock_movements` bloğunda **`quantity_change` → `change`** yap (bkz. P0-3 ile aynı düzeltme).
- `Table: customers` içindeki `city` kolonunu sil; `phone, address, customer_type` ekle.
- `Table: suppliers` içindeki `contact_name` → `contact_person`.
- `Table: supply_orders` içindeki `is_ai_override` kolonunu sil (model'de yok).

**Kabul kriteri:**
- `GET /api/anomaly/run` 500 atmıyor, 200 + boş ya da var olan modüllerden anomali döner.
- NLP "geçen ay finans raporu" sorusuna LLM artık `finance_records` SQL üretemez (schema'da yok).

**Test (`tests/test_anomaly.py` içine ekle):**
```python
def test_run_all_anomaly_checks_no_finance_records(client, db_session, test_tenant):
    """finance_records tablosu yok; servis 500 yerine boş finans bölümü döndürmeli."""
    resp = client.get("/api/anomaly/run")
    assert resp.status_code == 200
    body = resp.json()
    sources = {a["source"] for a in body["anomalies"]}
    assert "finance" not in sources or len(body["anomalies"]) == 0
```

**Verifikasyon:**
```powershell
pytest tests/test_anomaly.py tests/test_nlp_role_aware.py -v
```

**Commit:**
```
fix(models): remove references to non-existent finance_records/employees tables (ACTION_PLAN P0-2)
```

---

### [x] P0-3 — `stock_movements.quantity_change` → `change` (ham SQL fix)

**Dosya:** `app/services/anomaly_service.py`  
**Satır:** 202-247 civarı (`detect_inventory_anomalies` fonksiyonu)

**Before:**
```python
rows = db.execute(
    text(
        """
        SELECT sm.id, sm.product_id, p.name AS product_name,
               sm.quantity_change, sm.movement_type
        FROM stock_movements sm
        JOIN products p ON p.id = sm.product_id
        WHERE sm.tenant_id = :tid
        ORDER BY sm.id DESC
        LIMIT 100
        """
    ),
    {"tid": tenant_id},
).fetchall()
...
changes = [float(r.quantity_change) for r in rows]
...
direction = "düşüş" if row.quantity_change < 0 else "artış"
...
f"{abs(row.quantity_change)} adet"
...
extra={
    "quantity_change": float(row.quantity_change),
    ...
}
```

**After:** Tüm `quantity_change` → `change` (5 yer):
```python
SELECT sm.id, sm.product_id, p.name AS product_name,
       sm.change, sm.movement_type
...
changes = [float(r.change) for r in rows]
...
direction = "düşüş" if row.change < 0 else "artış"
...
f"{abs(row.change)} adet"
...
extra={
    "quantity_change": float(row.change),  # response anahtarı geriye uyumlu kalsın
    ...
}
```

> **Not:** `extra["quantity_change"]` response anahtarı frontend kullanıyorsa **dokunma**; yalnız SQL/Python tarafındaki `r.change` referanslarını düzelt.

**Daha temiz alternatif (önerilen):** Ham SQL yerine SQLAlchemy ORM kullan:
```python
from app.models.stock_movement import StockMovement
from app.models.product import Product

stmt = (
    select(StockMovement.id, StockMovement.product_id, Product.name.label("product_name"),
           StockMovement.change, StockMovement.movement_type)
    .join(Product, Product.id == StockMovement.product_id)
    .where(StockMovement.tenant_id == tenant_id)
    .order_by(StockMovement.id.desc())
    .limit(100)
)
rows = db.execute(stmt).all()
```

**Kabul kriteri:** `detect_inventory_anomalies(db, tenant_id=X)` test verisiyle 500 atmadan çalışır; en az 1 anomali tespit eder (test verisinde uç değer eklenmişse).

**Test (`tests/test_anomaly.py` içine):**
```python
def test_detect_inventory_anomalies_uses_change_column(db_session, test_tenant):
    """Ham SQL hatası: 'change' kolonu kullanılmalı, 'quantity_change' değil."""
    # Seed: normal hareketler + bir aykırı değer
    ...
    from app.services.anomaly_service import detect_inventory_anomalies
    results = detect_inventory_anomalies(db_session, tenant_id=test_tenant.id)
    # 500 / OperationalError yok demektir; assert sayısal
    assert isinstance(results, list)
```

**Verifikasyon:**
```powershell
pytest tests/test_anomaly.py -v -k inventory
```

**Commit:**
```
fix(anomaly): rename SQL column quantity_change to change (ACTION_PLAN P0-3)
```

---

### [x] P0-4 — Sales route'undaki ham DB sorgusunu servise taşı

**Dosya:** `app/api/routes/sales.py`  
**Satır:** 86-108 (`daily_sales_analytics` fonksiyonu)

**Sorun:** `AGENTS.md §3` ve `.cursor/rules/backend.mdc` "route'ta DB sorgusu yasak" diyor. `sales_service.daily_sales_points` zaten var (PROGRESS.md 2026-05-03 notuna göre).

**Yapılacak:**

#### 4a. `app/services/sales_service.py`
`daily_sales_points` metodu yoksa ekle (varsa atla):
```python
from datetime import date
from typing import List, Optional
from pydantic import BaseModel

class DailySalesPoint(BaseModel):
    date: date
    quantity: int
    revenue: float

def daily_sales_points(
    self,
    db: Session,
    tenant_id: int,
    *,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> List[DailySalesPoint]:
    stmt = (
        select(
            SalesRecord.sale_date.label("date"),
            func.coalesce(func.sum(SalesItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(SalesItem.line_total), 0).label("revenue"),
        )
        .join(SalesItem, SalesItem.sales_record_id == SalesRecord.id)
        .where(SalesRecord.tenant_id == tenant_id)
        .where(SalesItem.tenant_id == tenant_id)
        .group_by(SalesRecord.sale_date)
        .order_by(SalesRecord.sale_date.asc())
    )
    if start_date is not None:
        stmt = stmt.where(SalesRecord.sale_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(SalesRecord.sale_date <= end_date)
    rows = db.execute(stmt).all()
    return [
        DailySalesPoint(date=r.date, quantity=int(r.quantity), revenue=float(r.revenue))
        for r in rows
    ]
```

#### 4b. `app/api/routes/sales.py`
Route'u küçült:
```python
from app.services.sales_service import sales_service, DailySalesPoint  # ortak tip

@router.get("/analytics/daily", response_model=List[DailySalesPoint])
def daily_sales_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(SALES_READ)),
    db: Session = Depends(get_db),
):
    return sales_service.daily_sales_points(
        db, ctx.tenant_id, start_date=start_date, end_date=end_date
    )
```

**Kabul kriteri:**
- `app/api/routes/sales.py` içinde `select(`, `db.execute(`, `func.` çağrısı **kalmaz**.
- Mevcut frontend `GET /api/sales/analytics/daily` aynı response şemasını alır.

**Test:**
```python
def test_daily_sales_analytics_uses_service(client, db_session, test_tenant):
    resp = client.get("/api/sales/analytics/daily")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
```

**Verifikasyon:**
```powershell
# Route içinde SQLAlchemy kalmadı mı?
Select-String -Path app/api/routes/sales.py -Pattern "(select|db\.execute|func\.)" -Quiet
# False dönerse: temiz.

pytest tests/ -v
```

**Commit:**
```
refactor(sales): move daily analytics SQL from route to service (ACTION_PLAN P0-4)
```

---

### [x] P0-5 — NLP schema prompt'unu model metadata'sından otomatik üret

**Dosya:** `app/services/nlp_assistant.py`  
**Satır:** ~244-282 (`_unified_nlp_system_prompt` içindeki schema bloğu)

**Sorun:** LLM'e gönderilen schema açıklamasında **kolon adları yanlış**: `customers.city`, `suppliers.contact_name`, `stock_movements.quantity_change`, `supply_orders.is_ai_override`. LLM yanlış SQL üretir, runtime'da `no such column` hatası.

**Yapılacak:**

#### 5a. Yeni yardımcı: `app/services/_schema_doc.py`
```python
"""Schema documentation generator for NLP prompts.

Generates a single source of truth for table/column documentation
from SQLAlchemy metadata. Prevents drift between models and LLM prompts.
"""
from __future__ import annotations

from sqlalchemy import MetaData

# NLP'ye gösterilecek tablolar (whitelist).
_DEFAULT_NLP_TABLES = {
    "products", "sales_records", "sales_items",
    "stock_movements", "supply_orders",
    "customers", "suppliers",
    "sales_forecast_results",
}

_ADMIN_EXTRA_TABLES = {"tenants", "users"}


def build_nlp_schema_doc(metadata: MetaData, *, include_admin: bool = False) -> str:
    """SQLAlchemy MetaData'sından LLM prompt için schema bloğu üretir."""
    allowed = _DEFAULT_NLP_TABLES | (_ADMIN_EXTRA_TABLES if include_admin else set())
    blocks: list[str] = []
    for table in metadata.sorted_tables:
        if table.name not in allowed:
            continue
        cols = ", ".join(c.name for c in table.columns)
        blocks.append(f"Table: {table.name}\n  - {cols}")
    return "\n\n".join(blocks)


def nlp_table_whitelist(include_admin: bool = False) -> set[str]:
    return _DEFAULT_NLP_TABLES | (_ADMIN_EXTRA_TABLES if include_admin else set())
```

#### 5b. `app/services/nlp_assistant.py` içinden hardcoded schema'yı kaldır

```python
from app.models.base import Base
from app.services._schema_doc import build_nlp_schema_doc, nlp_table_whitelist

# Eski _ADMIN_ALL_TABLES ve ALLOWED_TABLES yerine:
def _allowed_tables_for(role: str, active_modules: list[str] | None) -> set[str]:
    include_admin = role == "admin"
    return nlp_table_whitelist(include_admin=include_admin)
```

`_unified_nlp_system_prompt` içindeki `Table: ...` satırlarını **tamamen kaldır**, yerine:
```python
schema_doc = build_nlp_schema_doc(Base.metadata, include_admin=is_admin)
return f"""You are the Future ERP AI assistant ...
...
Schema (auto-generated from SQLAlchemy metadata):

{schema_doc}

SQL rules ...
"""
```

#### 5c. `_validate_sql` dialect'ini DB'ye göre seç
```python
from sqlalchemy.engine import make_url
from app.core.config import settings

def _sqlglot_dialect() -> str:
    drv = make_url(settings.DATABASE_URL).drivername
    if drv.startswith("postgres"):
        return "postgres"
    return "sqlite"

# ...içinde:
expr = sqlglot.parse_one(raw, read=_sqlglot_dialect())
```

**Kabul kriteri:**
- LLM prompt'unda gösterilen schema, `Base.metadata` ile bire bir aynı.
- `_validate_sql` SQLite dev'de SQLite parser, Postgres prod'da Postgres parser kullanır.
- Yeni bir model + Alembic eklendiğinde **NLP prompt'u otomatik güncellenir** (kod değişikliği gerekmez, yalnız model whitelist'e eklenir).

**Test (`tests/test_nlp_role_aware.py` içine):**
```python
def test_schema_doc_reflects_actual_models():
    from app.models.base import Base
    from app.services._schema_doc import build_nlp_schema_doc
    doc = build_nlp_schema_doc(Base.metadata)
    # Hayalet tablolar yok:
    assert "finance_records" not in doc
    assert "employees" not in doc
    # Gerçek kolonlar var:
    assert "change" in doc  # stock_movements
    assert "customer_type" in doc  # customers
    assert "contact_person" in doc  # suppliers
    # Yanlış kolonlar yok:
    assert "quantity_change" not in doc
    assert "contact_name" not in doc
```

**Verifikasyon:**
```powershell
pytest tests/test_nlp_role_aware.py -v
```

**Commit:**
```
fix(nlp): generate schema prompt from SQLAlchemy metadata (ACTION_PLAN P0-5)
```

---

## P1 — Güvenlik & mimari (1-2 hafta içinde)

### [x] P1-1 — Refresh token HttpOnly cookie'ye taşı

**Etki:** 5 dosya değişir, frontend kontratı değişir, **backwards compat** için bir geçiş süresi gerekir.

**Adım 1:** `app/api/routes/auth.py` — `Response` cookie yazımı
```python
from fastapi import Response

@router.post("/login", response_model=TokenPairOut)
@limiter.limit("5/minute")
def login(request: Request, payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    user, access, refresh = auth_service.login(...)
    response.set_cookie(
        key="future_erp_refresh",
        value=refresh,
        httponly=True,
        secure=settings.is_production,  # P1-7 ile birlikte
        samesite="lax",
        max_age=settings.JWT_REFRESH_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )
    return TokenPairOut(access_token=access, refresh_token=refresh)  # geriye uyum
```

**Adım 2:** `/auth/refresh` cookie'den okusun, body'den fallback:
```python
@router.post("/refresh", response_model=TokenPairOut)
def refresh_tokens(
    request: Request,
    response: Response,
    payload: Optional[RefreshIn] = None,
    db: Session = Depends(get_db),
):
    raw = request.cookies.get("future_erp_refresh") or (payload.refresh_token if payload else None)
    if not raw:
        raise UnauthorizedException("Refresh token yok.")
    _, access, refresh = auth_service.refresh(db, refresh_token=raw)
    response.set_cookie(...)
    return TokenPairOut(access_token=access, refresh_token=refresh)
```

**Adım 3:** `frontend/src/lib/authSession.ts` — refresh token'ı **sakla ama göndermeye gerek yok**:
```typescript
// Access token: bellek (modül scope) — sayfa yenilenince refresh ile yeniden al.
let _access: string | null = null

export function getAccessToken() { return _access }
export function saveAccessToken(t: string) { _access = t }
export function clearSession() {
  _access = null
  // refresh cookie backend tarafından silinmeli — /auth/logout çağrısı yeterli
}

// localStorage'tan tamamen vazgeç.
```

**Adım 4:** `frontend/src/lib/api.ts` — axios `withCredentials: true`:
```typescript
export const api = axios.create({
  baseURL: "/api",
  timeout: 20_000,
  withCredentials: true,  // cookie göndermek için
})
```

**Backend CORS:** `app/main.py` `allow_credentials=True` zaten var. ✓

**Kabul kriteri:**
- Login sonrası `Set-Cookie: future_erp_refresh=...; HttpOnly; SameSite=Lax` header'ı döner.
- `localStorage`'da artık `future_erp_refresh_token` YOK.
- Sayfa yenilenince `/auth/refresh` cookie ile çalışır.

**Test:**
```python
def test_login_sets_refresh_cookie(client_no_auth, test_tenant):
    # Önce kullanıcı oluştur
    ...
    resp = client_no_auth.post("/api/auth/login", json={...})
    assert "future_erp_refresh" in resp.cookies
    cookie = resp.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie.lower()
```

**Commit:**
```
feat(auth): move refresh token to HttpOnly cookie (ACTION_PLAN P1-1)
```

---

### [x] P1-2 — `TenantScopedService` taban sınıfı

**Dosya yeni:** `app/services/_base.py`

```python
"""Tenant-scoped service base class.

Multi-tenant izolasyonunu zorla: her sorgu otomatik tenant_id ile filtrelenir.
Servis sınıfları bu sınıfı extend etmeli; ham sorgular sadece bu sınıfın
``_scoped`` veya ``_get_one`` helper'ları üzerinden gitmeli.
"""
from __future__ import annotations

from typing import Generic, Optional, TypeVar

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

M = TypeVar("M")


class TenantScopedService(Generic[M]):
    """Tüm tenant'a özel servisler için taban sınıf."""

    model: type[M]

    def _scoped(self, tenant_id: int) -> Select:
        """tenant_id ile önceden filtrelenmiş SELECT döner."""
        return select(self.model).where(self.model.tenant_id == tenant_id)  # type: ignore[attr-defined]

    def _get_one(self, db: Session, tenant_id: int, pk: int) -> Optional[M]:
        stmt = self._scoped(tenant_id).where(self.model.id == pk)  # type: ignore[attr-defined]
        return db.scalar(stmt)
```

**Adım 2:** Mevcut servisleri tek tek taşı (her birini ayrı commit):
- `ProductsService(TenantScopedService[Product])`
- `CustomersService(TenantScopedService[Customer])`
- `SuppliersService(TenantScopedService[Supplier])`
- `SalesService(TenantScopedService[SalesRecord])` (item tarafı için ayrı helper)
- `InventoryService(TenantScopedService[Product])`

**Acceptance:**
```python
def test_tenant_scoped_filters_other_tenant(db_session):
    """ProductsService.list başka tenant ürününü dönemez."""
    t1 = Tenant(name="A", slug="a"); t2 = Tenant(name="B", slug="b")
    db_session.add_all([t1, t2]); db_session.flush()
    p1 = Product(tenant_id=t1.id, sku="X1", name="A-ürünü", unit_price=Decimal("1"))
    p2 = Product(tenant_id=t2.id, sku="X2", name="B-ürünü", unit_price=Decimal("1"))
    db_session.add_all([p1, p2]); db_session.flush()
    rows = products_service.list(db_session, t1.id)
    assert all(r.tenant_id == t1.id for r in rows)
    assert p2 not in rows
```

**Commit:**
```
refactor(services): introduce TenantScopedService base class (ACTION_PLAN P1-2)
```

---

### [x] P1-3 — NLP SQL validator AST tabanlı yeniden yaz

**Dosya:** `app/services/nlp_assistant.py:_validate_sql`

**Değişiklikler:**

1. **Keyword string-match kaldır.** Yerine AST gez:
```python
import sqlglot
from sqlglot import expressions as sgexp

def _validate_sql(sql, allowed_tables=None, cross_tenant=False):
    raw = sql.strip()
    
    # 1. Parse — dialect DB'ye göre
    try:
        statements = sqlglot.parse(raw, read=_sqlglot_dialect())
    except Exception as e:
        raise UnsafeSQL(f"SQL parse failed: {e}") from e
    
    if len(statements) != 1 or statements[0] is None:
        raise UnsafeSQL("Tek bir SELECT bekleniyor.")
    expr = statements[0]
    
    # 2. Sadece SELECT olabilir
    if not isinstance(expr, sgexp.Select):
        raise UnsafeSQL("Yalnızca SELECT sorgularına izin var.")
    
    # 3. Mutasyon node'u yok mu? (AST üzerinden)
    forbidden_nodes = (sgexp.Insert, sgexp.Update, sgexp.Delete, sgexp.Drop, 
                       sgexp.Create, sgexp.Alter, sgexp.TruncateTable)
    if any(expr.find(node) for node in forbidden_nodes):
        raise UnsafeSQL("DDL/DML node'u tespit edildi.")
    
    # 4. Tablo whitelist kontrolü
    effective = allowed_tables or set()
    seen = {t.name for t in expr.find_all(sgexp.Table)}
    unknown = seen - effective
    if unknown:
        raise UnsafeSQL(f"İzin verilmeyen tablolar: {sorted(unknown)}")
    
    # 5. Tenant filtresi (cross_tenant değilse)
    if not cross_tenant:
        # :tid bind parameter var mı?
        if ":tid" not in raw.lower():
            raise UnsafeSQL("Tenant filtresi (:tid) yok.")
```

2. **Yorum reddi** — AST içinde `Comment` node yok ama parser yorumları yok sayar; ek olarak ham metinde `--`, `/*`, `#` kontrolü:
```python
if any(c in raw for c in ("--", "/*", "*/")) or "\n#" in ("\n" + raw):
    raise UnsafeSQL("SQL yorum kabul edilmez.")
```

**Test (`tests/test_nlp_role_aware.py` içine):**
```python
def test_validate_sql_rejects_column_named_delete():
    """'deletion_at' kolon adı keyword-match nedeniyle reddedilmemeli."""
    from app.services.nlp_assistant import _validate_sql
    sql = "SELECT id, deletion_at FROM products WHERE tenant_id = :tid LIMIT 5"
    # AST tabanlı olduğu için bu SQL geçer
    _validate_sql(sql, allowed_tables={"products"})

def test_validate_sql_rejects_insert():
    from app.services.nlp_assistant import _validate_sql, UnsafeSQL
    with pytest.raises(UnsafeSQL):
        _validate_sql("INSERT INTO products (sku) VALUES ('X')", allowed_tables={"products"})

def test_validate_sql_rejects_two_statements():
    from app.services.nlp_assistant import _validate_sql, UnsafeSQL
    with pytest.raises(UnsafeSQL):
        _validate_sql("SELECT 1; SELECT 2", allowed_tables=set())
```

**Commit:**
```
fix(nlp): rewrite SQL validator with AST-based checks (ACTION_PLAN P1-3)
```

---

### [x] P1-4 — Admin impersonation audit log

**Dosya yeni:** `app/models/audit_log.py`
```python
from datetime import datetime
from typing import Optional
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_tenant_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tenants.id"), nullable=True, index=True)
    target_entity_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    target_entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
```

**Alembic migration:**
```powershell
alembic revision --autogenerate -m "audit_logs table"
alembic upgrade head
```

**`app/core/deps.py:get_tenant` güncelle:**
```python
def get_tenant(request, principal, db):
    tenant_id = principal.tenant_id
    if principal.role == "admin":
        hdr = request.headers.get("X-Impersonate-Tenant-Id")
        if hdr:
            try:
                tid_int = int(hdr)
                if tid_int > 0 and tid_int != principal.tenant_id:
                    tenant_id = tid_int
                    # AUDIT: admin başka tenant'a girdi
                    from app.models.audit_log import AuditLog
                    db.add(AuditLog(
                        actor_tenant_id=principal.tenant_id,
                        actor_user_id=principal.user_id,
                        action="admin.impersonate_tenant",
                        target_tenant_id=tenant_id,
                        payload={"method": request.method, "path": request.url.path},
                    ))
                    db.commit()
            except (ValueError, TypeError):
                pass
    ...
```

**Commit:**
```
feat(audit): log admin tenant impersonation events (ACTION_PLAN P1-4)
```

---

### [x] P1-5 — `_ADMIN_TENANT_ID = 1` magic number kaldır

**Dosya:** `app/realtime/notification_ws_hub.py:77`  
**Dosya:** `app/api/routes/anomaly.py:60` (import)

**Adım:** `Tenant.is_platform_admin: bool` kolonu ekle (Alembic), `_ADMIN_TENANT_ID` referanslarını DB sorgusuyla değiştir:
```python
def _admin_tenant_ids(db: Session) -> set[int]:
    return set(db.scalars(select(Tenant.id).where(Tenant.is_platform_admin.is_(True))).all())
```

Daha basit alternatif: admin **rol** üzerinden tespit edilsin, tenant değil:
- `ConnectionManager`'a `connect(websocket, tenant_id, role)` parametresi ekle.
- Admin role'lü bağlantıları ayrı tut.

**Commit:** `refactor(ws): remove _ADMIN_TENANT_ID magic number (ACTION_PLAN P1-5)`

---

### [x] P1-6 — Transaction yönetimini normalize et

**Dosya:** `app/services/sales_service.py:create_record`  
**Dosya:** `app/services/products_service.py:create`

**Sorun:** Aynı iş akışı içinde 2 ayrı `db.commit()`. İkinci commit başarısız olursa yarım kayıt.

**Çözüm (her iki dosyada):**
```python
# YANLIŞ — 2 commit
db.add(record)
db.commit()  # ❌
for sm in stock_movements:
    db.add(sm)
db.commit()  # ❌

# DOĞRU — tek commit, ara flush
db.add(record)
db.flush()  # ✓ ID alır ama commit etmez
for sm in stock_movements:
    sm.sales_record_id = record.id
    db.add(sm)
db.commit()  # ✓ tek atomic commit
```

Eğer route Session'ı transaction içinde değilse, fonksiyonu `with db.begin():` ile sarmala.

**Test:**
```python
def test_create_sales_record_atomic_on_failure(db_session, test_tenant, monkeypatch):
    """Stok hareketi yazımı patlarsa sales_record da yazılmamalı."""
    # monkeypatch StockMovement.__init__ → exception
    ...
```

**Commit:** `fix(services): normalize transaction boundaries (ACTION_PLAN P1-6)`

---

### [x] P1-7 — `settings.is_production` property + ENV tutarsızlığı

**Dosya:** `app/core/config.py`

**Ekle:**
```python
@property
def is_production(self) -> bool:
    return self.ENV.lower() in ("prod", "production")
```

**Kullanım yerleri (grep ile bul):**
- `app/main.py:48` → `if not settings.is_production:`
- `app/core/logging.py` (kontrol et)
- `app/core/config.py:_validate_jwt_secret` → `is_production` mantığını kullan

**Test:**
```python
def test_is_production_accepts_both_strings(monkeypatch):
    from app.core.config import Settings
    monkeypatch.setenv("ENV", "prod")
    assert Settings().is_production
    monkeypatch.setenv("ENV", "production")
    assert Settings().is_production
    monkeypatch.setenv("ENV", "dev")
    assert not Settings().is_production
```

**Commit:** `refactor(config): unify ENV check with is_production property (ACTION_PLAN P1-7)`

---

### [x] P1-8 — Multi-tenant izolasyon testleri (her route için)

**Dosya yeni:** `tests/test_tenant_isolation.py`

**Şablon:**
```python
"""Çapraz-tenant veri sızıntısı testleri.

Her tenant-scoped endpoint için: 'tenant A başka tenant'ın verisini göremez'.
"""
import pytest
from decimal import Decimal
from app.models.product import Product
from app.models.tenant import Tenant
from app.models.user import User
from app.core.security import hash_password


@pytest.fixture
def two_tenants_with_data(db_session):
    t1 = Tenant(name="Tenant 1", slug="t1")
    t2 = Tenant(name="Tenant 2", slug="t2")
    db_session.add_all([t1, t2]); db_session.flush()
    u1 = User(tenant_id=t1.id, email="a@a.com", password_hash=hash_password("X"), role="admin", is_active=True)
    u2 = User(tenant_id=t2.id, email="b@b.com", password_hash=hash_password("X"), role="admin", is_active=True)
    p1 = Product(tenant_id=t1.id, sku="T1-A", name="t1-ürün", unit_price=Decimal("1"))
    p2 = Product(tenant_id=t2.id, sku="T2-A", name="t2-ürün", unit_price=Decimal("1"))
    db_session.add_all([u1, u2, p1, p2]); db_session.flush()
    return t1, t2, u1, u2, p1, p2


@pytest.mark.parametrize("path", [
    "/api/products",
    "/api/customers",
    "/api/suppliers",
    "/api/sales/records",
    "/api/inventory/orders",
])
def test_endpoint_returns_only_own_tenant_data(client_for, two_tenants_with_data, path):
    """client_for: tenant A için yetkili client; tenant B verisi dönmemeli."""
    t1, t2, u1, *_ = two_tenants_with_data
    client = client_for(u1)
    resp = client.get(path)
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        for row in resp.json():
            if "tenant_id" in row:
                assert row["tenant_id"] == t1.id
```

> **Not:** `client_for` fixture'ını `conftest.py`'da factory olarak ekle (kullanıcı parametresi alıp ona göre principal oluştursun).

**Commit:** `test(tenant): cross-tenant leak guard tests (ACTION_PLAN P1-8)`

---

## P2 — Kalite, ürünleştirme (3-6 hafta)

> Bu görevleri P0 ve P1 tamamlanmadan başlatma.

### [x] P2-1 — Frontend: React Query + Dashboard refactor
### [x] P2-2 — Frontend: lazy loading + code splitting  
### [x] P2-3 — Frontend: token storage cookie/memory hybrid (P1-1 ile bağlantılı)
### [x] P2-4 — Frontend: TypeScript sürümünü `~5.6` veya gerçek stable'a çek
### [x] P2-5 — Frontend: Error boundary + standart `<LoadingState />`
### [x] P2-6 — `requirements.txt` pin'le (`pip-compile`)

---
## UX — Kullanılabilirlik İyileştirmeleri (Yüksek Öncelik)

> Bu görevler P2-7/P2-8 altyapı işlerinden **önce** tamamlanmalı.
> Her biri bağımsız; sırayla commit et.

### [x] P2-17 — UX: Satış-Müşteri CRM bağlantısı (P2-10 yerine)
**Kapsam:** Backend FK + frontend dropdown  
- `sales_records` tablosuna `customer_id` nullable FK (→ customers.id, SET NULL)  
- Alembic migration  
- `SalesRecordCreate/Out` schema güncelle  
- `sales_service.create_record`: `customer_id` kabul et, `customer_name` otomatik doldur  
- Frontend `Sales.tsx`: müşteri adı text → CRM'den arama/seçim dropdown  
- Satış listesinde müşteri adı → `/customers` bağlantısı  

### [x] P2-18 — UX: Stok hareketi sonrası geri bildirim
**Kapsam:** Hareket kaydedilince kullanıcı bilgilendirilmeli  
- Stok ayarlama sonrası toast → hareket detayı (tür, miktar, yeni bakiye)  
- Stok hareketleri bölümü otomatik açılıp yeni hareketi göster  
- "Stok güncellendi" onay badge'i

### [x] P2-19 — UX: Tedarik siparişi sonrası akış göstergesi
**Kapsam:** AI "Draft oluşturdu" mesajı yeterli değil; kullanıcıyı yönlendir  
- Auto-draft sonrası "Sırada ne var?" info kartı (siparişler sayfasına link)  
- Orders sayfasında yeni Draft'lar vurgulanmış göster  
- Stock sayfasında bekleyen taslak sipariş sayısı badge'i

### [x] P2-20 — UX: Finans tarih filtresi URL-state'e taşı
**Kapsam:** Tarih aralığı değiştirince sayfa pozisyonu sıfırlanmamalı  
- `useSearchParams` ile tarih aralığını URL'e yaz  
- Filter değişince sadece query yenile, sayfa scroll/state korunur  
- Tarayıcı geri tuşuyla önceki aralığa dönüş çalışır

### [x] P2-21 — UX: Dashboard AI aksiyon kartları
**Kapsam:** Dashboard "bilgi göster" değil "aksiyon al" odaklı olmalı  
- AI insights bölümünü dashboard'da üstte konumlandır  
- Her insight kartına doğrudan aksiyon butonu (stok → Draft, satış düşüşü → Analiz)  
- "Yapılacaklar" mini listesi: kritik stok sayısı + onay bekleyen sipariş sayısı

---

## Yol Haritası Özeti

```
Ay 1-2  | Temel Is Degeri      | P2-16, P2-22  (+ P2-17 DONE)
Ay 3-4  | Is Surecleri         | P3-1 ... P3-4
Ay 5-6  | SaaS Olgunlasma      | P4-1 ... P4-5
DevOps  | Altyapi (paralel)    | P2-7, P2-8, P2-9
```

---

## Ay 1-2 — Temel İş Değeri

> [x] **P2-17** Satış ↔ Müşteri CRM bağlantısı — **TAMAMLANDI**

---

### [ ] P2-16 — Bildirim Merkezi Backend Persistence

**Kapsam:** WS bildirimleri şu an sadece bellekte; sayfa yenilenince kayboluyor. DB'de saklayıp okundu/okunmadı takibi ekle.

**Backend:**
- `notifications` tablosu: `id, tenant_id, user_id (nullable), type, title, body, severity, read_at, created_at`
- Alembic migration
- `NotificationService`: `create()`, `list_for_tenant()`, `mark_read()`, `mark_all_read()`
- `GET /notifications` — son 50 bildirim (pagination desteğiyle)
- `PATCH /notifications/{id}/read` — tek bildirim okundu işaretle
- `PATCH /notifications/read-all` — hepsini okundu işaretle
- WS hub her broadcast'te aynı anda DB'ye kaydet

**Frontend:**
- `NotificationBell.tsx`: WS listesi → DB'den çekilen liste ile birleştir (React Query)
- Okunmamış sayacı gerçek zamanlı güncelle (WS gelince query invalidate)
- Bildirim panelinde okundu/okunmadı toggle + "Tümünü okundu işaretle" butonu
- Sayfa yenilense bile bildirimler kaybolmaz

**Kabul kriteri:** Backend restart sonrası önceki bildirimler hâlâ görünür.

---

### [ ] P2-22 — Gider Takibi Modülü

**Kapsam:** Şirketlerin gelir yanında giderlerini de girebileceği yeni modül. Finans sayfasında gerçek kar-zarar görünsün.

**Backend:**
- `expenses` tablosu: `id, tenant_id, category, amount, description, expense_date, created_by, created_at`
- Kategoriler (enum): `rent` (Kira), `salary` (Maaş), `utilities` (Fatura), `raw_material` (Hammadde), `other` (Diğer)
- Alembic migration
- `ExpenseService`: CRUD, `monthly_totals()`, `by_category()`
- `GET/POST /expenses` — liste + oluşturma
- `PATCH/DELETE /expenses/{id}`
- `GET /expenses/summary` — dönem bazlı toplam + kategori dağılımı
- `/finance/summary` endpoint'i gider verisini dahil et: `total_expenses`, `net_profit = gross_profit - total_expenses`

**Frontend:**
- `Expenses.tsx` sayfası: CRUD tablosu + kategori badge'leri + tarih filtresi
- `Finance.tsx`: "Net Kâr" KPI kartı ekle (Ciro − COGS − Giderler)
- Gider trend grafiği (aylık, kategoriye göre renkli bar chart)
- AppSidebar'a "Giderler" linki

**Veri modeli notu:** Önce migration, sonra service, sonra route, sonra frontend.

---

## Altyapı & DevOps (Paralel Yürütülür)

### [ ] P2-7 — CI workflow (GitHub Actions)

**Kapsam:** Her PR'da otomatik test + type-check

`yaml
# .github/workflows/ci.yml
jobs:
  backend:
    - pip install -r requirements-dev.txt
    - alembic upgrade head
    - pytest -x -q
  frontend:
    - npm ci
    - npx tsc --noEmit
    - npm run build
`

### [ ] P2-8 — Docker + docker-compose

**Kapsam:** `docker compose up` ile tüm stack ayağa kalksın

`
services:
  backend:  uvicorn app.main:app --host 0.0.0.0 --port 8000
  frontend: nginx (vite build output)
volumes:
  - ./data:/app/data  (SQLite dosyası)
`

### [ ] P2-9 — Sentry + correlation ID middleware

**Kapsam:** Üretimde hata takibi + istek izlenebilirliği
- `X-Request-ID` header middleware (UUID inject)
- Sentry SDK entegrasyonu (FastAPI + React)
- Hata loglarına `tenant_id` + `request_id` ekle

---

## Veri Modeli İyileştirmeleri (Ay 1-2 Sonunda)

### [x] P2-10 — Customer.id <-> SalesRecord.customer_id iliskisi → P2-17 ile kapsandı

### [ ] P2-11 — Soft-delete indeksleri + filtre helper
**Kapsam:** Tüm `deleted_at IS NULL` filtreleri merkezi bir helper'dan geçsin; indeks eksikleri giderilsin.

### [ ] P2-12 — SalesItem üzerine KDV/tax kolonu
**Kapsam:** `tax_rate NUMERIC(5,2) DEFAULT 0`, `tax_amount` hesaplanmış kolon — e-Fatura hazırlığı.

---

## Ay 3-4 — İş Süreçleri

### [ ] P3-1 — Toplu CSV Import (ürün & müşteri)

**Kapsam:** Excel/CSV'den toplu veri yükleme
- `POST /products/import` — CSV upload, satır bazlı hata raporu
- `POST /customers/import`
- Frontend: drag-and-drop upload alanı, önizleme tablosu, hatalı satırları vurgula
- Maks. 500 satır / istek; duplike SKU kontrolü

### [ ] P3-2 — Satınalma Siparişi Onay Akışı

**Kapsam:** `SupplyOrder` durumu `Draft → Pending → Approved → Completed / Rejected`
- Durum geçişleri için permission kontrolü (`purchasing.approve`)
- `PATCH /inventory/orders/{id}/status`
- Frontend: Orders sayfasında tablo + aksiyon butonları
- Dashboard'da "Onay bekleyen sipariş" sayacı

### [ ] P3-3 — Müşteri Değer Analizi (LTV)

**Kapsam:** Her müşteri için hesaplanmış metrikler
- `GET /customers/{id}/analytics`: toplam harcama, sipariş sayısı, ort. sipariş değeri, son sipariş tarihi, tahmini LTV
- Müşteri listesinde puan badge'i
- "En değerli müşteriler" raporu

### [ ] P3-4 — Görev / Hatırlatıcı Sistemi

**Kapsam:** Basit iç görev takibi (CRM'e entegre)
- `tasks` tablosu: `title, due_date, assigned_to, related_customer_id (nullable), status`
- `GET/POST/PATCH /tasks`
- Frontend: müşteri kartında bağlı görevler; Dashboard'da "Görevler" mini-widget
- Vadesi geçmiş görevler → bildirim kanalına düşsün

---

## Ay 5-6 — SaaS Olgunlaşma

### [ ] P4-1 — Abonelik / Billing Modülü

**Kapsam:** Tenant başına plan yönetimi
- `plans` tablosu: Free / Starter / Pro
- iyzico veya Stripe webhook entegrasyonu
- Plan limitleri: kullanıcı sayısı, modül erişimi, AI çağrı kotası

### [ ] P4-2 — Çoklu Depo / Şube Desteği

**Kapsam:** P2-13 iskeletini tamamla
- `warehouses` + `stock_levels` tabloları
- Stok hareketleri depo bazlı
- Ürün sayfasında depo seçici

### [ ] P4-3 — PWA + Mobil Optimizasyon

**Kapsam:** Uygulama mobilde kullanılabilir olsun
- `manifest.json` + service worker (Vite PWA plugin)
- Touch-friendly card layout (< 640px)
- Offline stok görüntüleme (cached)

### [ ] P4-4 — Otomatik Haftalık AI Raporu (In-App)

**Kapsam:** Her Pazartesi otomatik özet bildirimi (P2-14 önkoşul)
- Celery beat görevi: haftalık satış/gider/stok özeti
- AI ile kısa yorum üret
- Bildirim Merkezi'ne (P2-16) düşsün

### [ ] P4-5 — PDF Fatura & Excel Export

**Kapsam:** Yasal uyumluluk için belge üretimi
- `GET /sales/records/{id}/pdf` — WeasyPrint ile fatura PDF
- `GET /finance/export` — dönem bazlı Excel (openpyxl)
- Frontend'de "PDF İndir" + "Excel İndir" butonları

---

## Büyük Mimari (Uzun Vadeli Önkoşullar)

### [ ] P2-13 — Multi-warehouse iskelet (`warehouses`, `stock_levels`) — P4-2 önkoşulu
### [ ] P2-14 — Redis + Celery (Prophet & anomaly background) — P4-4 önkoşulu
### [ ] P2-15 — PostgreSQL geçişi + JSONB (SQLite'dan migration)

---

## Genel kurallar — Claude Code için

1. **Sırayla git.** P0 bitmeden P1'e geçme; Ay 1-2 bitmeden Ay 3-4'e geçme.
2. **Her görev = bir commit.** Conventional Commits + `(ACTION_PLAN P<X>-<N>)` etiketi.
3. **Test yaz.** Görev "complete" sayılmaz, eğer ona dair test yoksa.
4. **Doğrulama komutunu çalıştır.** `pytest -x` veya görev içinde belirtilen komut.
5. **Sorun çıkarsa görevi `in_progress` bırak.** Hatayı dosyada `### Notlar` başlığı altına yaz.
6. **Checkbox işaretle.** `[ ]` → `[x]`. Bitenleri en üste taşıma; sırayı koru.
7. **Hiçbir model değişikliği migration'sız olmayacak.** `alembic revision --autogenerate` zorunlu.
8. **Kullanıcıya sormadan görev silme/değiştirme yok.** Yeni gereksinim çıkarsa ACTION_PLAN'ın sonuna yeni görev olarak ekle.

---

## İlerleme Takibi

### Tamamlananlar
- [x] P0-1 — WS tenant_id sızıntısı
- [x] P0-2 — Hayalet tablo temizliği
- [x] P0-3 — `quantity_change` → `change`
- [x] P0-4 — Sales route → service refactor
- [x] P0-5 — NLP schema auto-generation
- [x] P1-1 — Refresh cookie
- [x] P1-2 — TenantScopedService
- [x] P1-3 — NLP validator AST
- [x] P1-4 — Audit log
- [x] P1-5 — `_ADMIN_TENANT_ID` kaldır
- [x] P1-6 — Transaction normalize
- [x] P1-7 — `is_production` property
- [x] P1-8 — Multi-tenant test seti
- [x] P2-1 — React Query + Dashboard refactor
- [x] P2-2 — Lazy loading + code splitting
- [x] P2-3 — Token storage memory hybrid
- [x] P2-4 — TypeScript strict mode
- [x] P2-5 — ErrorBoundary + LoadingState
- [x] P2-6 — pip-compile requirements pin
- [x] P2-17 — Satış ↔ Müşteri CRM bağlantısı
- [x] P2-18 — Stok hareketi toast + auto-scroll
- [x] P2-19 — Tedarik siparişi sonrası modal
- [x] P2-20 — Finans tarih filtresi URL-state
- [x] P2-21 — Dashboard AI aksiyon kartları

### Sıradaki (öncelik sırasıyla)
- [ ] P2-16 — Bildirim Merkezi Backend Persistence  <- Ay 1-2
- [ ] P2-22 — Gider Takibi Modülü                  <- Ay 1-2
- [ ] P2-7  — CI workflow (GitHub Actions)          <- paralel
- [ ] P2-8  — Docker + docker-compose               <- paralel
- [ ] P2-9  — Sentry + correlation ID               <- paralel
- [ ] P2-11 — Soft-delete indeksleri
- [ ] P2-12 — KDV/tax kolonu
- [ ] P3-1  — CSV Import                            <- Ay 3-4
- [ ] P3-2  — Sipariş onay akışı                    <- Ay 3-4
- [ ] P3-3  — Müşteri LTV analizi                   <- Ay 3-4
- [ ] P3-4  — Görev / Hatırlatıcı                   <- Ay 3-4
- [ ] P4-1  — Billing modülü                        <- Ay 5-6
- [ ] P4-2  — Çoklu depo                            <- Ay 5-6
- [ ] P4-3  — PWA + mobil                           <- Ay 5-6
- [ ] P4-4  — Haftalık AI raporu                    <- Ay 5-6
- [ ] P4-5  — PDF fatura & Excel export             <- Ay 5-6