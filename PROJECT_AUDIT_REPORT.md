# Future ERP — Kapsamlı Proje Denetim Raporu

> Tarih: 2026-05-19  
> Kapsam: Backend (FastAPI), Frontend (React 19), Mimari, Güvenlik, Test, DevOps  
> Aktif faz: 1 (RBAC + multi-tenant SQLite çekirdek)

---

## 0. Yönetici Özeti

Projenin **temeli sağlam, vizyon güçlü, kod kalitesi orta-üst seviyede.** Multi-tenant + RBAC iskeleti doğru kurulmuş, Alembic disiplini iyi, structlog + global exception handler + slowapi rate limiter gibi olgun seçimler yapılmış. Ancak **production'a çıkmadan mutlaka kapatılması gereken bir veri sızıntısı (P0 kritik bug)**, model ile servisler arasında **kullanılmayan / kırık 3 tablo referansı**, ve bir dizi mimari kısayol var. Tez teslimine yetecek olgunlukta, ürünleştirmek için 4–6 haftalık disiplinli bir P0/P1 çalışması gerek.

**Çıkacak en önemli 5 madde:**

1. **P0 — Multi-tenant WebSocket veri sızıntısı:** `ws_notifications.py` JWT'den `tenant_id` okurken yanlış key kullanıyor (`tid` yerine `tenant_id`), her bağlantı `tenant_id=1`'e düşüyor.  
2. **P0 — Hayalet tablolar:** `finance_records` ve `employees` tabloları kodda referans alınıyor, model yok, migration yok → anomali tespiti ve NLP üretimi runtime'da çöküyor.
3. **P0 — Kolon adı uyumsuzluğu:** `stock_movements.quantity_change` ham SQL'de kullanılıyor, gerçek kolon `change`. Anomali tespiti satır 222'de patlıyor.
4. **P1 — JWT localStorage'da:** XSS riski; refresh token HttpOnly cookie'de olmalı.
5. **P1 — NLP SQL doğrulayıcı zayıf:** sqlglot dialect mismatch (postgres), keyword string-match false positive üretiyor, admin tenant filtresini tamamen bypass ediyor.

---

## 1. P0 — Veri sızıntısı / kırık özellikler (HEMEN düzeltilmeli)

### 1.1. WebSocket multi-tenant sızıntısı (KRİTİK)

**Dosya:** `app/api/routes/ws_notifications.py:35`

```python
tenant_id = int(payload.get("tenant_id") or 1)
```

**Sorun:** `create_access_token` JWT payload'una `"tid"` anahtarıyla yazıyor (bkz. `app/core/security.py:46`), `"tenant_id"` değil. Sonuç olarak `payload.get("tenant_id")` her zaman `None` döner, fallback `1` (admin tenant) devreye girer. **Her tenant'ın çalışanı admin tenant'ın bildirim kanalına bağlanır**; admin tenant'ın anomalileri herkese yayınlanabilir, ya da tam tersi.

**Çözüm:**
```python
tenant_id = int(payload.get("tid") or 0)
if not tenant_id:
    await websocket.close(code=1008, reason="tenant yok")
    return
```

**Ek not:** Access token URL query string'inde — sunucu logu, proxy logu, tarayıcı history'sinde sızıyor. WS subprotocol veya kısa ömürlü tek-kullanımlık WS token üretip onu sorgu parametresinde geçir; cookie tabanlı çözüm daha doğru.

### 1.2. Hayalet tablolar: `finance_records`, `employees`

**Dosyalar:**
- `app/services/anomaly_service.py:76` → `FROM finance_records` (model yok)
- `app/services/anomaly_service.py:209` → `sm.quantity_change` (kolon adı yanlış)
- `app/services/nlp_assistant.py:39, 244-274` → schema prompt'unda var, modellerde yok
- `app/core/module_config.py:139, 143` → `MODULE_TABLE_MAP` içinde

**Sonuçlar:**
- `GET /api/anomaly/run` çağrılır çalmaz `OperationalError: no such table: finance_records` → 500.
- Manager/Admin rolüyle NLP "geçen ayki giderleri göster" denirse LLM `finance_records` SQL üretir → `UnsafeSQL` veya `OperationalError`.
- Employee rolüyle bile employees tablosu modülde aktifse aynı sorun.

**Çözüm yolları (2 seçenek):**
- **A) Modelleri ekle:** `FinanceRecord`, `Employee` modelleri + Alembic migration + servis CRUD. Tez kapsamında daha tutarlı.
- **B) Referansları temizle:** `MODULE_TABLE_MAP`'tan, anomaly_service'ten, NLP prompt'undan kaldır; finance modülü mevcut `sales_records/sales_items` üzerinden çalışsın.

> Şu an `finance_service.summary()` zaten `sales_records + sales_items` üzerinden çalışıyor; bu doğru yaklaşım. `finance_records` tablosu *iki ayrı dünyada* yaşıyor.

### 1.3. Kolon adı bug'ı

**Dosya:** `app/services/anomaly_service.py:202-223`

```python
sm.quantity_change, sm.movement_type  ← gerçek kolon: change
```

Gerçek model: `app/models/stock_movement.py:22` → `change: Mapped[int]`. Bu fonksiyon canlı veriyle çağrıldığı anda 500 atar.

**Çözüm:** `quantity_change` → `change` (3 yerde) ya da modele yeni kolon ekleyip migration et.

### 1.4. NLP prompt schema'sı modellerle uyumsuz

`app/services/nlp_assistant.py:244-274` içindeki "Schema (SQLite-friendly)" bölümü:
- `stock_movements.quantity_change` ✗ (gerçek: `change`)
- `customers.city` ✗ (gerçekte yok; `address` var)
- `suppliers.contact_name` ✗ (gerçek: `contact_person`)
- `supply_orders.is_ai_override` ✗ (model'de yok)
- `finance_records`, `employees` tabloları yok

LLM bu prompt'a güvenerek yanlış SQL üretir. SQL validator tablo adlarını yakalar ama kolon adlarını yakalamaz — sorgu DB'ye gider, runtime'da patlar. Bu prompt **bir kez modellerden otomatik üretilmeli**:

```python
def build_schema_doc(metadata: MetaData) -> str:
    return "\n\n".join(
        f"Table: {t.name}\n  - " + ", ".join(c.name for c in t.columns)
        for t in metadata.sorted_tables
    )
```

### 1.5. Sales route'da ham DB sorgusu (kural ihlali)

**Dosya:** `app/api/routes/sales.py:86-108`

```python
@router.get("/analytics/daily", ...)
def daily_sales_analytics(...):
    stmt = (
        select(...).join(...).where(...).group_by(...).order_by(...)
    )
    rows = db.execute(stmt).all()
```

`AGENTS.md §3` ve `.cursor/rules/backend.mdc` "route'ta DB sorgusu yasak" diyor. `sales_service.daily_sales_points()` zaten var, fonksiyon yalnız orayı çağırmalı.

---

## 2. P1 — Güvenlik (kısa vadede düzeltilmeli)

### 2.1. JWT depolaması

`frontend/src/lib/authSession.ts` access + refresh token'ı **localStorage**'da tutuyor. Bir XSS hatası tüm tenant'ın oturumunu çalar.

**Çözüm:**
- Access token bellekte (React state / closure'da) tut, sayfa kapanınca git.
- Refresh token **HttpOnly, Secure, SameSite=Lax cookie**'de.
- Backend `/auth/refresh` cookie okusun, body parametresine fallback yapsın.

Bu, `.cursor/rules/security.mdc`'de zaten yazılı kuralın hâlâ uygulanmayan kısmı.

### 2.2. NLP SQL doğrulayıcı zayıflıkları

`app/services/nlp_assistant.py:_validate_sql`:

| Sorun | Açıklama | Çözüm |
|---|---|---|
| Dialect mismatch | `sqlglot.parse_one(raw, read="postgres")` ama runtime SQLite. Postgres'e özgü ifadeler parse edilir, SQLite reddeder. | `read="sqlite"` yap; production'da `read="postgresql"`. |
| Keyword string-match | `if any(k in up for k in bad_keywords)`: kolon adı `deletion_at` "DELETE" trigger eder. | AST üzerinden gez (`expr.find_all(sqlglot.expressions.Delete/Insert/Update)`). |
| Yorum reddi | `--` ve `/*` reddedilir ama `#` (SQLite/MySQL'de yorum) eklenmez. | Tüm yorum biçimlerini ekle veya yorumları AST'de kontrol et. |
| Admin tenant bypass | `cross_tenant=True` ise `:tid` filtresi zorunlu değil; LLM yanlışlıkla `WHERE tenant_id = 5` üretebilir, NEW tenant verisi sızar. | Admin için bile en az **denetim logu** + opt-in flag iste. |
| Multiple statements | `if ";" in raw` (string match); ` ;` (boşluk + noktalı virgül) içerebilir; multi-line SQL'de yanlış pozitifler verir. | `sqlglot.parse(...)` sonucu tek statement döndürmeli. |
| Subquery / CTE | Allowed table filtresi `expr.find_all(Table)` ama tablo aliasını veya WITH RECURSIVE sorgusunu denetlemez. | Recursive walker + CTE adlandırma kuralları. |

### 2.3. Admin impersonation auditing yok

`app/core/deps.py:get_tenant` admin için `X-Impersonate-Tenant-Id` header'ı destekliyor. Log yok, audit trail yok. Production'da bunu **özellikle** loglamak gerek (kim, ne zaman, hangi tenant'a girdi).

### 2.4. Parola politikası gevşek

`app/schemas/auth.py:_password_strength`:
- 8 char + 1 büyük harf + 1 rakam.
- Özel karakter zorunlu değil.
- HIBP / blocklist kontrolü yok ("Password1" geçer).
- Rate limit signup'ta `3/minute` — botlar için yetersiz.

**Öneri:** Argon2 zaten OK. Yanı sıra:
- Minimum 12 karakter
- Özel karakter zorunlu veya **passphrase** desteği
- Common-passwords listesi reddi (örn. `zxcvbn-python`)
- Captcha (signup) + email doğrulama

### 2.5. CORS ve headers

`app/main.py`:
- `allow_credentials=True` + `allow_origins=settings.cors_origins_list()` → iyi, default sadece localhost.
- **Eksik headerlar:** `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`. Bunlar nginx/CDN'de de eklenebilir.

### 2.6. JWT secret default değeri

`app/core/config.py:_DEFAULT_JWT_KEY` 48 karakter ama `production` kontrolü `env == "production"` kıyaslıyor. **`main.py:48` ise `ENV.lower() != "prod"`** ile WS simülasyonunu açıyor. İki farklı string ("prod" vs "production"). Tek noktada `Settings.is_production` property tanımla:

```python
@property
def is_production(self) -> bool:
    return self.ENV.lower() in ("prod", "production")
```

---

## 3. P1 — Mimari ve katman ayrımı

### 3.1. `TenantScopedService` taban sınıfı yok

`AGENTS.md §4.1` ve `backend.mdc` zorunlu kılıyor; ancak `app/services/*` içinde böyle bir taban sınıf yok. Şu anda her servis `where(Model.tenant_id == tenant_id)` filtresini elle yazıyor. **Bir gün biri unutacak.**

**Öneri:**
```python
# app/services/_base.py
class TenantScopedService(Generic[M]):
    model: type[M]
    
    def _scoped(self, db: Session, tenant_id: int) -> Select:
        return select(self.model).where(self.model.tenant_id == tenant_id)
```

Sonra `ProductsService(TenantScopedService[Product])`. Bonus: pytest fixture'ında "rastgele tenant_id ile sorgulayıp leak var mı" testi yazılır.

### 3.2. Transaction yönetimi karışık

`sales_service.create_record` içinde **iki ayrı `db.commit()` çağrısı** var (satır 106 ve 121). İkinci commit başarısız olursa satış kaydı ve stok hareketi tutarsız kalır. Aynı kalıp `products_service.create`'de de var.

**Çözüm:** Servis tek `db.commit()` sonunda yapsın; ara veriler `db.flush()` ile yazılsın. Daha iyisi `with db.begin():` context manager.

### 3.3. Repository pattern yok

Servisler hem business logic hem ORM. Test edilebilirlik orta. Büyürken `services/products_service.py` 1000 satıra ulaşacak. Önerim: `repositories/` katmanı + `services/` saf iş kuralı.

### 3.4. Background task yok

`anomaly_service.run_all_anomaly_checks` üç ayrı IsolationForest çağırır; SQLite'da bile 100 satırda saniyeler sürebilir. Şu an **request'in içinde**, üstüne `await asyncio.to_thread` da yok → event loop tıkanır.

**Faz 2 hedefi:** Celery + Redis + Beat. Bu hazırlığı şimdiden yapmak için en azından arayüzü `submit_anomaly_scan(tenant_id) -> task_id` şekline getir.

### 3.5. In-memory state — multi-instance'da kırılır

- `app/api/routes/anomaly.py:_latest_results: dict[int, list]` — process-local cache.
- `app/realtime/notification_ws_hub.py:_ws_anomaly_last_sent_by_product` — process-local.
- `notification_manager` ConnectionManager — process-local.

İki uvicorn worker açtığınızda yarısı kayıp olur, WS broadcast tüm kullanıcılara ulaşmaz. Production öncesi **Redis pub/sub** + Redis TTL cache.

### 3.6. ConnectionManager thread-safety

`_by_tenant: dict[int, list[WebSocket]]` üzerinde `setdefault/append/remove` çağrıları **lock'suz**. Anomaly loop async olduğu için tek event loop'ta sorun çıkmaz; ama `connect`/`disconnect` farklı task'larda eş zamanlı koşarken `list.remove` race condition ortaya çıkabilir. asyncio.Lock veya `set` kullanımı düşünülmeli.

### 3.7. Tenant.active_modules JSON-as-Text

`app/models/tenant.py:29` SQLite Text içine JSON sıkıştırıyor. Python tarafında getter/setter doğru ama:
- DB seviyesinde validasyon yok
- `WHERE active_modules LIKE '%sales%'` yapamıyorsunuz
- Postgres'e geçince `JSONB` tipi avantajını kaçırırsınız

**Öneri:** SQLAlchemy `JSON` tipini kullan (SQLite + Postgres ikisinde de desteklenir).

### 3.8. Hardcoded `_ADMIN_TENANT_ID = 1`

`app/realtime/notification_ws_hub.py:77` admin tenant'ı magic number ile sabitlemiş. Yeni bir kurulumda admin başka bir tenant'sa kırılır. **Çözüm:** `Tenant.is_platform_admin: bool` kolon ekle veya `users.role == "admin"` üzerinden çıkarsa.

---

## 4. P2 — Backend kod kalitesi

### 4.1. Pydantic v2 `model_config = ConfigDict(from_attributes=True)` tutarsız

Bazı şemalarda var (`UserOut`), bazılarında yok. Tüm `*Out` şemalarında olmalı.

### 4.2. Şema-model alan uyumsuzlukları (frontend ile bağlantılı)

Frontend `api.ts:411-413` `low_stock_products` içinde `tenant_name` bekliyor; `ai_insights.py:36-45` `low_stock` listesinde tenant_name yok (sadece admin context'inde var). Frontend dökümante edilmiş ama backend'de "manager için low_stock" ile "admin için critical_stock_items" arasında alan adı farkı var (`low_stock_products` vs `critical_stock_items`). Birleşik tipi mutlaka tek noktadan üret.

**Çözüm:** OpenAPI/JSON Schema'dan TypeScript tipi üret (`openapi-typescript` veya `orval`).

### 4.3. SQLite-spesifik fonksiyonlar

`finance_service.monthly_revenue:99` → `func.strftime("%Y-%m", SalesRecord.sale_date)`. Postgres'te bu fonksiyon yok. Faz 2'ye geçince `func.to_char(SalesRecord.sale_date, 'YYYY-MM')` veya `func.date_trunc('month', ...)` gerekecek.

**Öneri:** Dialect-agnostic helper:
```python
def month_expr(col):
    if dialect == 'sqlite':
        return func.strftime("%Y-%m", col)
    return func.to_char(col, 'YYYY-MM')
```

### 4.4. Decimal/float karışımı

`finance_service.summary` aritmetiği `Decimal` ve `float` arasında geziniyor. `cogs` `float`'a indirgeniyor (satır 63), `gross_profit = revenue_f - cogs` → float aritmetiği. Para hesabında **kuruş kaybı** olur. Tüm finansal değerler `Decimal` kalmalı, response noktasında `float`'a dönüşmeli.

### 4.5. SalesRecord `customer_name` ile Customer modeli ayrı

`sales_records.customer_name: String` serbest metin, `customers` tablosuyla **bağlı değil**. Aynı müşteri "Ahmet Yılmaz" ve "ahmet yılmaz" şeklinde 2 kayıt olabilir. `top_customers` GROUP BY ile aynı müşteriyi ayrı sayar.

**Çözüm:** `SalesRecord.customer_id: ForeignKey("customers.id", nullable=True)` ekle, `customer_name` cache alanı olarak kalsın. Migration ekle.

### 4.6. `Customer/Supplier` soft delete eksik tutarlı

Modelde `deleted_at: Optional[DateTime]` var ama servislerin `list()`'inde `WHERE deleted_at IS NULL` filtresi yok (`customers_service.py`'a bakmadım ama büyük ihtimalle yok). Tutarsız.

### 4.7. Index önerileri

- `sales_records(tenant_id, sale_date)` composite index → analytics sorguları %50+ hızlanır.
- `stock_movements(tenant_id, product_id, created_at DESC)` → ürün hareket geçmişi.
- `users(tenant_id, role)` zaten var ama (`is_active`) eklenirse log-in sorguları hızlanır.

### 4.8. Rate limiter sadece IP bazlı

`slowapi` `get_remote_address` proxy arkasında çalışmaz (`X-Forwarded-For` parse etmiyor). Production'da IP yerine kullanıcıya / tenant'a göre limit:
```python
key_func=lambda req: req.state.principal.tenant_id if hasattr(req.state, "principal") else get_remote_address(req)
```

### 4.9. Refresh token tablosu büyür

Logout = `revoked_at = now` (silmiyor). `used_at` da set ediliyor. Refresh tablosu **kullanıcı başına haftada 10-20 satır** birikir. Cron + cleanup script veya `expires_at < now() - interval '30 day'` periyodik DELETE gerek.

### 4.10. `print` kullanımı

Kural: `print()` YASAK. Hızlı `grep` ile bakmadım ama scripts/ klasöründe seed_data.py vs muhtemelen print kullanıyor. Linter'a `flake8-print` ekle.

### 4.11. `requirements.txt` versiyon kilidi yok

Çoğu paket pin'lenmemiş; `fastapi`, `pandas`, `numpy`, `prophet` → her `pip install` farklı çözüm üretir. **Tez teslimi sırasında reproducible build için** `pip-compile` ile `requirements.lock` üret.

### 4.12. Prophet ortam yükü

`prophet` paketi ~200MB, `pystan`/`cmdstanpy` derleme istiyor. Docker imajı şişer. Faz 4 öncesi alternatif değerlendir: `statsforecast`, `darts`, ya da basit ExponentialSmoothing (statsmodels).

---

## 5. P2 — Frontend kalitesi

### 5.1. `typescript: "~6.0.2"` — GERÇEK DEĞİL

TypeScript stabil 5.x serisindedir. Bu sürüm büyük olasılıkla `npm install` sırasında **en yeni 5.x'i çekecek ve kilit yok**. `package.json:40` düzelt: `"typescript": "~5.6.0"` (veya kullandığın gerçek sürüm).

### 5.2. Token localStorage'da

Bkz. §2.1.

### 5.3. State management eksik

- `Dashboard.tsx`'te 6 paralel `api.get` çağrısı, hiçbiri cache'lenmiyor.
- Aynı `useEffect` her tab değişiminde tekrar atar.
- `useAuth().user` değişimi tüm bağlı component'leri re-render eder.

**Öneri:** **TanStack Query (React Query) eklenmeli**. Cache, dedup, stale-while-revalidate, retry, mutation invalidation hep ücretsiz gelir. AGENTS.md "henüz yok, gerekince eklenir" diyor — **şimdi gerek.**

### 5.4. Code splitting yok

`App.tsx` tüm sayfaları statik import ediyor. İlk yüklemede 1MB+ JS gelir. `lazy(() => import("./pages/Admin"))` + `<Suspense>` ile sayfa başına chunk üret.

### 5.5. `Dashboard.tsx` monolitik

543 satır, üç farklı dashboard (admin/manager/employee) tek dosyada. Üç ayrı bileşene böl: `AdminDashboard`, `ManagerDashboard`, `EmployeeDashboard` + ortak `DashboardLayout`.

### 5.6. Error boundary yok

Bir sayfa render hatası tüm uygulamayı çökerten beyaz ekran üretir. Root'a `<ErrorBoundary fallback={<AppErrorPage />}>` koy.

### 5.7. Skeleton ve loading inconsistency

`SkeletonKpiGrid`, `<div>Yükleniyor…</div>`, ve `if (loading) return null` üç farklı kalıp aynı projede kullanılıyor. Bir `<LoadingState />` standardı oluştur.

### 5.8. WebSocket reconnect

`wsNotifications.ts` (okumadım ama davranışı belli): access token expire olunca WS koparılır mı, yeniden bağlanır mı? Token refresh'ten sonra WS'i yenileyen handler şart.

### 5.9. Accessibility (WCAG)

- `<button>` yerine `<div onClick>` kullanılan yerler olabilir.
- Renk kontrastı `slate-400 dark:text-slate-500` zayıf — Lighthouse audit önerilir.
- Form inputlarında `aria-describedby` eksik.
- Modal/Toast focus trap kontrol edilmeli.

### 5.10. i18n hardcoded

Tüm UI metni dosyalara gömülü. `react-i18next` veya `i18next` ile JSON'a taşı; ileride çoklu dil = saatlik iş, şimdi haftalık.

### 5.11. Stil duplikasyonu

`"flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"` neredeyse 10 yerde tekrar ediyor. `card` utility class'ı veya bir `<Card>` component'i.

### 5.12. Vite proxy production'da yok

`vite.config.ts` proxy sadece dev'de. Production build'inde `/api` mutlak URL'ye işaret etmeli (env var ile). `VITE_API_BASE_URL=https://api.future-erp.com` gibi. axios `baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api"`.

---

## 6. Test kapsamı

| Alan | Mevcut | Eksik |
|---|---|---|
| Auth API | ✓ (`test_auth_api.py`) | Refresh replay attack, rate limit testi |
| Products API | ✓ (`test_products_api.py`) | RBAC 403 senaryoları |
| Inventory | ✓ (`test_inventory_api.py`) | Stock < 0 boundary |
| Anomaly | ✓ (`test_anomaly.py`, 427 satır) | Gerçek tablo eksikliği gizliyor olabilir |
| HR | ✓ | Cross-tenant leak testi |
| NLP role-aware | ✓ | Prompt injection testleri |
| **Multi-tenant leak** | ✗ | **Yok!** En kritik test alanı. |
| Sales/Finance servis | ✗ | Daily/monthly aggregation matematik |
| WS connection | ✗ | tenant_id parse, cooldown |
| Frontend pages | ✗ | Sadece smoke + api.test |
| E2E | ✗ | Playwright kurulu ama `e2e/` klasörü görünmüyor |

**En kritik eksiklik — multi-tenant izolasyon testi:**

```python
def test_tenant_a_cannot_see_tenant_b_products(client_for_tenant_a, products_tenant_b):
    resp = client_for_tenant_a.get("/api/products")
    assert all(p["id"] not in [p.id for p in products_tenant_b] for p in resp.json())
```

Her route için bu testi yaz. Bu, projenin **ana savunma hattı**.

**Coverage hedefi:**
- `auth/`, `core/permissions.py`, `services/`: %80+
- Route'lar: %60+
- AI/anomaly: %40+ (ML çıktısı stable test edilemez)

**CI/CD eksik:**
- `.github/workflows/` klasörü yok.
- Her PR'da `pytest + npm run test + npm run build + alembic upgrade head --sql` çalışmalı.

---

## 7. Veritabanı & migration

### Genel durum
- 7 migration dosyası, doğru sırada, batch mode + SQLite uyumlu.
- `env.py` `compare_type=True, compare_server_default=True` doğru.
- Initial schema + sonra incremental — temiz.

### Sorunlar

**7.1.** `archive/future_erp_ai.db.bak` ve `_verify_autoseed.db` repository içinde kalmış. `.gitignore`'a `*.db` ile alınmış ama mevcut dosya işlenmiş. `git rm --cached *.db` + history clean (BFG) önerilir.

**7.2.** Sayfada `future_erp_ai.db.pre-repair-20260503-154143.bak` dev artefaktı var; archive klasörüne taşı.

**7.3.** Postgres geçişi için checklist:
- `String(64)` → `String` length kontrolleri Postgres'te de geçerli
- `BIGINT` vs `INT` — ID'ler `Integer` (32-bit). Tenant başına 2 milyar kayıt limiti — Faz 2 öncesi `BigInteger` düşünülebilir.
- Timezone: `DateTime(timezone=True)` doğru kullanılmış.
- `JSON` vs `JSONB`: Postgres'te `JSONB` daha hızlı; SQLAlchemy `JSON` tipi otomatik seçmiyor. Postgres'e geçince `sa.dialects.postgresql.JSONB` ile değiştir.

**7.4.** Soft-delete index eksik
`Customer.deleted_at` ve `Supplier.deleted_at` üzerinde index yok; `WHERE deleted_at IS NULL` her sorguda tam tarama.

---

## 8. Mimari & ürünleştirme önerileri

### 8.1. Service injection (DI) ile test edilebilirlik

Şu an `products_service = ProductsService()` modül-level singleton. Test sırasında mock injection zor. FastAPI `Depends(get_products_service)` ile servisleri DI yapısına al.

### 8.2. Domain events

Stok değişimi → bildirim → satış kaydı → KDV hesabı zinciri var. Şu an her servis diğerini direkt çağırıyor. **Domain events** ile gevşek bağlama:

```python
class StockChanged(Event):
    product_id: int
    new_balance: int

dispatcher.dispatch(StockChanged(product_id=p.id, new_balance=new))
# Anomaly listener, notification listener, audit listener bağımsız reaksiyon
```

`blinker` veya `aiokit` ile başlanabilir.

### 8.3. Audit log tablosu

`audit_logs(id, tenant_id, user_id, action, entity_type, entity_id, payload_json, created_at)` — admin impersonation, ürün silme, kullanıcı rolü değiştirme, fiyat değiştirme **mutlaka** loglanmalı. Faz 1'de iskele atılmalı, Faz 2'de zorla dolduralım.

### 8.4. Read replica / okuma-yazma ayrımı

Faz 4 SaaS için kritik. Bugünden `engine_read` / `engine_write` ayrımı yapılırsa, sonra Postgres + replica eklemek konfig işidir.

### 8.5. Observability

- **Sentry**: frontend + backend error tracking.
- **OpenTelemetry**: structlog'ta zaten correlation_id (request_id) bekleniyor (`AGENTS.md`'de yok ama gerek). FastAPI middleware ile `X-Request-ID` ekle.
- **Prometheus**: `prometheus-fastapi-instrumentator` 5 dakikada kurulur, /metrics endpoint açar.

### 8.6. Feature flag

`tenant.active_modules` zaten bir feature flag sistemi. Ama A/B test, beta-only modüller için `LaunchDarkly` veya self-hosted **Unleash** düşünülmeli. Tez kapsamında basit DB tabanlı `tenant.feature_flags: JSON` da yeterli.

### 8.7. Cache stratejisi

- `/api/auth/me`: TTL 60sn, kullanıcı değişince invalidate.
- `/api/finance/summary`: tenant başına 5dk cache.
- `/api/products`: müdür tarafında ürün düzenlendi → invalidate.

Redis + `aiocache` veya `fastapi-cache2`.

### 8.8. WebSocket → Server-Sent Events alternatifi

Bildirim akışı tek yönlü (server → client). SSE daha basit, HTTP/2 üzerinden, auth header doğal. WebSocket gerçek bidirectional gerek olduğunda saklı tut (chat, collaborative editing).

### 8.9. AI / agentic mimari

Şu an NLP "tek seferlik prompt → SQL üret → çalıştır → özetle". Agentic vizyon için **bir adım daha**: 

1. **Function calling** ile structured tool çağrıları (`get_low_stock`, `create_draft_order`).
2. **Multi-step planlama**: "Geçen ay en az satan ürünlerin tedarikçilerine indirim talebi taslağı hazırla" → 3 adım.
3. **Memory**: kullanıcının sorgu geçmişi vektör veritabanında.

Bu Faz 3 hedefi ama bugün için: NLP servisinde `tools: list[Tool]` parametresi ile arayüzü hazırlanabilir.

### 8.10. Çoklu para birimi & KDV

`SalesItem.unit_price` Numeric(12,2) — TL varsayımı. KDV ayrı kolon yok. e-Fatura için **mutlaka** `tax_rate, tax_amount, currency` kolonları gerek. Bu, Faz 3'te değil **şimdi** modele ekle, sonradan migration daha acılı.

### 8.11. Multi-warehouse desteği

`Product.stock_quantity` tek sayı — depo yok. KOBİ için gelecekte birden fazla şube/depo gerekir:
```
warehouses(id, tenant_id, name)
stock_levels(product_id, warehouse_id, quantity)
```
Bugün eklemek 2 saat, sonra eklemek 2 hafta.

### 8.12. Dosya/medya

`frontend/src/assets/hero.png` git'te (~200KB). Tüm görsel asset CDN'e (Cloudflare R2, S3) taşınmalı. Tez yeterli olabilir ama ürüne giderken görsel yönetimi gerek.

---

## 9. UX / arayüz iyileştirmeleri

### 9.1. Mobile-first eksik
- Sidebar sticky, mobile'da yer kaplıyor.
- Tablolar `overflow-x-auto` ile değil, **card view** + tablo toggle.
- Touch target boyutu 44x44px hedeflenmeli.

### 9.2. Empty states

`EmptyState` bileşeni var — kullanılıyor mu görsel olarak baktım, tüm listelerde değil. "Henüz ürün yok" yerine **görsel + call-to-action** ekle.

### 9.3. Onboarding wizard tek seferlik

Manager onboarding sayfasına girdiğinde **yeniden konfigüre edebileceğini** bilmiyor (settings'ten gidiyor). Wizard'ı sticky-progressive bar + "İstediğiniz an düzenleyebilirsiniz" mesajıyla yumuşat.

### 9.4. Bildirim merkezi UX

- Mute → localStorage. Ama tarayıcı değiştirince mute kaybolur. Kullanıcı tercihi backend'de saklanmalı.
- "Tümünü okundu işaretle" var mı? Yoksa ekle.
- 30 günden eski bildirimler temizlensin.

### 9.5. Komut paleti (cmd+K)

ERP'de en hızlı navigasyon yolu. `cmdk` (react-cmdk) ile global arama + "yeni ürün ekle", "stok düzelt", "satış kaydı" kısayolları.

### 9.6. Data table

Sales/Stock sayfalarında muhtemelen kendiniz HTML tablo yazıyorsunuz. `tanstack-table` (headless) + virtualization (büyük listeler için) hayat kurtarır.

### 9.7. Dark mode tutarsız

`ThemeContext` var ama bazı sayfalar `dark:` variant'ı eksik bırakıyor. Audit gerekli.

### 9.8. Para girişi

Türkiye'de virgül/nokta karışıklığı. `Intl.NumberFormat` ile **input mask** kullan. `react-number-format` 2KB.

### 9.9. Form hata gösterimi

Backend `{error: {code, message}}` döner. Frontend bunu `getApiErrorMessage` ile toast'a çeviriyor. **Field-level hata** (`details` array) gösterimi yok — kullanıcı hangi alanın yanlış olduğunu çıkaramıyor.

### 9.10. Klavye kısayolları

- `Esc` → modal kapat ✓ (umarım)
- `Ctrl+Enter` → form submit ✗
- `?` → kısayol listesi göster ✗

---

## 10. DevOps / production hazırlığı

### 10.1. Docker yok

Faz 4'e bırakılmış ama **Dockerfile + docker-compose.yml** şimdi olsa CI'da koşturmak kolaylaşır. Multi-stage build (node → vite build → nginx static, python → uvicorn):

```dockerfile
FROM python:3.11-slim AS api
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0"]
```

### 10.2. CI/CD pipeline

`.github/workflows/ci.yml`:
- `pip install -r requirements-dev.txt`
- `alembic upgrade head` (in-memory SQLite)
- `pytest --cov`
- `cd frontend && npm ci && npm run lint && npm run test && npm run build`
- Ruff + mypy
- Cache pip/npm

### 10.3. Secrets

`.env`'de gerçek API key olduğu PROGRESS.md'de itiraf ediliyor. `gh secret` veya AWS/Azure Secret Manager'a taşı. **Şimdi rotasyon yap** (key sızdı varsayarak).

### 10.4. Database backup

Postgres'e geçince `pg_dump` + S3 yedek + retention policy. SQLite'da bile günlük `.bak` rotasyonu olmalı.

### 10.5. Monitoring

- **Uptime**: BetterStack / UptimeRobot.
- **Logs**: Loki + Grafana ya da Datadog.
- **APM**: Sentry Performance.

---

## 11. Tez ve dokümantasyon

### 11.1. README iyi ama eksik

Ekle:
- **Mimari diyagram**: PlantUML/Mermaid ile katmanlı şema.
- **API döküm**: Swagger zaten var (/docs) ama README'den link.
- **Veri akış diyagramı**: kullanıcı → React → /api → service → ORM → DB.
- **Deployment runbook**.
- **Troubleshooting**: en sık karşılaşılan hatalar.
- **Performance benchmark**: 1k ürün, 100k satış senaryosunda yanıt süreleri.

### 11.2. Architecture Decision Records (ADR)

`docs/adr/` klasörü açıp önemli kararları kaydet:
- ADR-001: Multi-tenant — shared schema + tenant_id column (DB per tenant değil).
- ADR-002: SQLite → Postgres geçişi neden Faz 2'ye?
- ADR-003: JWT + refresh rotation neden cookie değil header?
- ADR-004: AI sağlayıcısı Gemini neden OpenAI yerine fallback'te?

Tez juryesinin **mimari soruları**na hazır cevap olur.

### 11.3. Test raporu

`pytest --cov --cov-report=html` çıktısı tezde grafik.

### 11.4. Security threat model

STRIDE veya basit "10 tehdit + mitigasyon" tablosu. Bitirme tezinde fark yaratır.

---

## 12. Önerilen yol haritası (4-6 hafta)

### Hafta 1 — P0 acil müdahale
- [ ] WebSocket `tenant_id` bug'ı düzelt (1 saat, ama yeni testle birlikte 1 gün)
- [ ] `finance_records` / `employees` hayalet tablo temizliği (1 gün)
- [ ] `stock_movements.quantity_change` → `change` ham SQL fix (30 dk)
- [ ] Sales route'undaki ham SQL service'e taşı (1 saat)
- [ ] NLP schema prompt'unu MetaData'dan otomatik üret (yarım gün)

### Hafta 2 — P1 güvenlik
- [ ] Refresh token HttpOnly cookie'ye taşı (1-2 gün)
- [ ] NLP SQL validator AST tabanlı yeniden yaz (1 gün)
- [ ] Admin impersonation audit log (yarım gün)
- [ ] Parola politikası sıkılaştır + HIBP kontrolü opsiyonel (1 gün)
- [ ] CORS/CSP/HSTS header'ları (yarım gün)

### Hafta 3 — Mimari iskelet
- [ ] `TenantScopedService` taban sınıfı + tüm servisleri taşı (2 gün)
- [ ] Transaction yönetimi normalize et (1 gün)
- [ ] Çapraz-tenant izolasyon test seti (her endpoint için) (2 gün)
- [ ] CI workflow (GitHub Actions) (yarım gün)

### Hafta 4 — Frontend modernizasyon
- [ ] React Query entegrasyonu + Dashboard refactor (2 gün)
- [ ] Token storage cookie'ye çek + WS auth (1 gün)
- [ ] Lazy loading + code splitting (yarım gün)
- [ ] Error boundary + skeleton standartı (1 gün)
- [ ] Typescript sürüm düzelt + strict pass (1 gün)

### Hafta 5 — UX & gözlemlenebilirlik
- [ ] Bildirim merkezi backend persistence (1 gün)
- [ ] Cmd+K command palette (1 gün)
- [ ] Sentry + structlog correlation ID (1 gün)
- [ ] Mobile responsive sweep (2 gün)

### Hafta 6 — Faz 2 hazırlığı
- [ ] Postgres migration + JSONB (1 gün)
- [ ] Redis + Celery iskelet (Prophet & anomaly background) (3 gün)
- [ ] Docker + docker-compose (1 gün)
- [ ] ADR yaz, README diyagramları (1 gün)

---

## 13. Notlar / takdir edilen yönler

**Doğru yapılan şeyler — bunları korumak gerek:**

- ✅ Alembic disiplini (`Base.metadata.create_all` üretimde yok).
- ✅ Argon2 + DUMMY_HASH timing attack koruması.
- ✅ Refresh token rotation + replay attack detection (`used_at`).
- ✅ Email reserved-TLD problemi proaktif çözülmüş.
- ✅ Global exception handler tek tip JSON döner.
- ✅ Pydantic v2 + `from_attributes=True` doğru kullanım.
- ✅ Multi-tenant `tenant_id` filtresi servisler içinde tutarlı (route'ta ham sorgu hariç).
- ✅ AGENTS.md + .cursor/rules + PROGRESS.md tasarımı — AI asistan dostu, devamlılık güçlü.
- ✅ Sektör şablonu (`SECTOR_TEMPLATES`) güzel bir USP.
- ✅ Actionable AI (`auto-draft` endpoint) — sadece raporlayan değil eylem yapan.
- ✅ Frontend güzel görsel iskelet (Tailwind + lucide + dark mode).

---

## 14. Sonuç

Proje **tez teslimi için fazlasıyla yeterli**, ürünleştirme için **4-6 hafta odaklanmış çalışma** yeterli. En kritik 3 madde (WS sızıntısı, hayalet tablolar, kolon adı bug'ı) **bu hafta** kapatılmalı; bunlar olmadan demo sırasında runtime hatası alma riski yüksek.

USP açısından "agentic AI" iddianızı güçlendirecek tek hamle: **NLP'nin tool calling ile multi-step plan üretebilmesi**. Tez kapsamında bunu "Future Work" olarak yazabilir veya Faz 3'te küçük bir demo geliştirebilirsiniz — jüri için fark yaratır.

Başarılar.
