# Future ERP — AI Agent Talimatları

> Bu dosya, projede çalışan tüm AI asistanlarının (Cursor, Claude, Codex vb.) **otomatik yüklediği** ana talimat dosyasıdır. Burada yazılı kurallar her sohbette geçerlidir.

---

## 1. Proje kimliği

**İsim:** Future ERP
**Tek cümlelik tanım:** KOBİ'ler (özellikle Türkiye perakende sektörü) için **AI-first agentic ERP** — sadece raporlamayan, doğal dilde verilen komutları **eyleme dönüştüren**, anomalileri kendisi yakalayan, Excel'den otomatik veri içe alan bütünleşik iş yönetim sistemi.

**Hedefler:**
1. Bitirme tezi olarak savunulabilir akademik kalitede.
2. Tez sonrası gerçek KOBİ'lere satılabilir ürün.
3. Türkiye pazarına yönelik (TL, KDV, e-Fatura, T.C. lokalizasyon).

**USP (farklılaştırıcılar):**
- Agentic NLP asistanı (eylem yapan, sadece sorgulamayan).
- Excel/CSV otomatik içe aktarma (LLM ile kolon eşleme).
- Anomali tespiti (kasa açığı, fiyat sapması, anormal iade).
- Akıllı yeniden sipariş önerisi (Prophet + emniyet stoğu).
- Sektör şablonları (ilk: perakende/market).

---

## 2. Tech stack

| Katman | Teknoloji |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0 (typed `Mapped`), Pydantic v2, Alembic |
| Frontend | React 19, Vite, TypeScript (strict), Tailwind CSS v3, Recharts, react-router 7 |
| Veritabanı | SQLite (dev), PostgreSQL (Faz 2+ — hedef; Faz 1 çekirdeği SQLite ile tamamlandı) |
| AI / ML | OpenAI / Gemini SDK, Prophet (forecast), pandas |
| Auth | JWT access + refresh, Argon2 password hash (Faz 1) |
| Bildirim/Queue | **Dev:** in-process WebSocket (`app/realtime/`, Topbar bildirim merkezi). **Üretim hedefi:** Faz 2+ Redis + Celery |
| Test | pytest, httpx, factory_boy (backend); Vitest, Playwright (frontend) |
| DevOps | GitHub, Conventional Commits; Docker (Faz 4) |

---

## 3. Klasör yapısı ve sorumluluklar

```
Future_Erp/
├── app/                  # Backend (FastAPI)
│   ├── api/              # HTTP endpoint katmanı
│   │   ├── router.py     # Ana router birleştirici
│   │   └── routes/       # Modül başına route dosyası
│   ├── core/             # config, db, security, exceptions
│   ├── models/           # SQLAlchemy ORM modelleri
│   ├── schemas/          # Pydantic request/response şemaları
│   ├── services/         # İş mantığı (route'lardan ÇAĞRILIR)
│   ├── realtime/         # WebSocket hub (dev AI bildirim yayını)
│   ├── ai_engine/        # Forecast/AI özel modülleri
│   └── main.py           # FastAPI app factory
├── frontend/             # React UI
│   └── src/
│       ├── pages/        # Sayfa bileşenleri
│       ├── components/   # Paylaşılan UI (örn. `layout/NotificationBell`, WS toast)
│       ├── layout/       # AppShell, Topbar, yan menü
│       └── lib/api.ts    # TÜM API çağrıları buradan geçer
├── scripts/              # CLI scriptleri (seed, db, vb.)
├── migrations/           # Alembic migration'ları (Faz 0c sonrası)
├── tests/                # pytest (Faz 0f sonrası)
├── docs/                 # Mimari kararlar, raporlar
├── .cursor/
│   ├── rules/            # AI'a ek kod kuralları (paylaşılır)
│   └── PROGRESS.md       # KİŞİSEL günlük (gitignore'da, paylaşılmaz)
├── AGENTS.md             # BU DOSYA
├── .gitignore
├── requirements.txt
└── README.md
```

**Kritik kural — katman ayrımı:**
- `routes/` → SADECE I/O. Hiç iş mantığı YOK.
- `services/` → İş mantığı, validasyon, transaction yönetimi.
- `models/` → ORM tanımları.
- `schemas/` → API'nin dış yüzü (Pydantic).
- Route asla doğrudan `db.execute(...)` çağırmaz; servisi çağırır.

---

## 4. Mimari kararlar

### 4.1. Multi-tenant ready (Faz 1)
- Tüm domain modellerinde `tenant_id: int` zorunlu kolon olacak.
- Her DB sorgusu `tenant_id == current_tenant.id` ile filtrelenecek.
- Servis taban sınıfı (`TenantScopedService`) bu filtreyi otomatik uygulayacak.
- **Asla** ham SQL veya elle yazılmış sorguda tenant_id'siz `SELECT` olmayacak.

### 4.2. RBAC (Faz 1)
**Kodda uygulanan roller (Faz 1 çekirdek):** `admin`, `manager`, `employee` — izin matrisi `app/core/permissions.py`.

**Yol haritası (genişletme — Faz 2+):** aşağıdaki ayrımlar ileride modül büyüdükçe eklenebilir:
- `super_admin` — sistem sahibi (sadece geliştirici)
- `tenant_admin` — şirket sahibi/patron
- `sales` — satış personeli (POS, müşteri ekleme)
- `warehouse` — depo (stok, mal kabul, sayım)
- `accountant` — muhasebe (fatura, cari, KDV)

İzinler `Depends(require_permission("module.action"))` deseninde (`app/core/deps.py`).

### 4.3. Auth
- JWT: kısa ömürlü access (15 dk) + uzun ömürlü refresh (7 gün).
- Şifre: Argon2 (bcrypt değil).
- 2FA (TOTP): opsiyonel, Faz 1 stretch goal.

### 4.4. Migration stratejisi
- **Sadece Alembic.** `Base.metadata.create_all` üretimde **YASAK**.
- Test fixture'ları için istisna olabilir.
- Her schema değişikliği = yeni migration.

### 4.5. Dağıtım modeli
- **Faz 0–3:** Self-hosted (tek kiracı), tenant-aware kod.
- **Faz 4:** SaaS multi-tenant (subdomain veya path bazlı).

---

## 5. Kod stili

### Backend (Python)
- **Format/Lint:** Ruff (yapılandırılınca). Satır uzunluğu 100.
- **Type hints:** Her fonksiyon imzasında. mypy strict hedef.
- **SQLAlchemy 2.0:** `Mapped[Type]` + `mapped_column(...)`. Eski Declarative API yok.
- **Pydantic v2:** `BaseModel`, `model_config = ConfigDict(from_attributes=True)`.
- **Async tercihi:** Tüm I/O async. CPU-yoğun (Prophet, image) sync olabilir.
- **Hatalar:** `app/core/exceptions.py` sınıflarını kullan. Servis bazen `ValueError`/`RuntimeError` fırlatır; route’da bunları yakalayıp `ValidationException` (veya ilgili `AppException`) ile sarmalayabilirsin. Geniş `except Exception:` route’ta yok (`main.py` beklenmeyenleri loglar ve 500 döner).
- **Logging:** `structlog` + `app/core/logging.py`; `configure_logging()` `main` lifespan’da. ENV=`prod` iken JSON satırı; aksi konsol renkli. `print()` yasak.

### Frontend (TypeScript)
- **Strict mode:** `tsconfig` strict açık.
- **API çağrıları:** SADECE `frontend/src/lib/api.ts` üzerinden. Component içinde `fetch`/`axios` yasak.
- **State:** React state, Context. Redux/Zustand henüz yok (gerekince eklenir).
- **Tailwind:** Class isimleri sıralı (Prettier plugin); arbitrary value sadece zorunluysa.
- **Component:** Function component + named export. `default export` sadece sayfa dosyalarında.

### Genel
- **Dil:** Kod ve identifier'lar **İngilizce**. Kullanıcıya gösterilen mesajlar (UI, hata mesajları) **Türkçe**.
- **Commit mesajı:** Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).
- **Yorum:** Sadece "neden" yazılır, "ne" yazılmaz. Açıklayıcı yorum > yorumsuz kod ama gereksiz yorum YOK.

---

## 6. Asla yapma (kırmızı çizgiler)

1. **`tenant_id` filtresiz query yazma** — multi-tenant sızıntı = veri ihlali.
2. **`.env` dosyasını commit etme.** Secret'ları log'a düşürme.
3. **PII (kullanıcı adı, e-posta, T.C. kimlik) log'a yazma.**
4. **`Base.metadata.create_all(...)`** — sadece test fixture istisnası.
5. **Route içinde DB sorgusu** — service'e devret. _(Audit 2026-05-19: `routes/sales.py:daily_sales_analytics` bu kuralı ihlal ediyordu — P0-4 ile düzeltilecek.)_
6. **Auth/RBAC kodunu testsiz merge etme.**
7. **Mevcut migration'ı geriye dönük düzenleme** — yeni migration ekle.
8. **Frontend'de plain `fetch`/`axios`** — `lib/api.ts` zorunlu.
9. **Türkçe karakter sorunlarını "şimdilik" geçme** — `tr-TR` locale doğru kurulmalı.
10. **JWT claim adlarını "varsa böyledir" diye okuma** — `create_access_token` `"tid"` yazar; tüketim noktası **mutlaka `payload.get("tid")`** olmalı, `tenant_id` değil. Bkz. `app/core/security.py:40-52`.
11. **Hayalet tablo referansı** — bir tablo adını ham SQL veya NLP prompt'unda yazmadan önce `app/models/` altında o model var mı doğrula. Aksi halde runtime'da `OperationalError`. _(Audit 2026-05-19: `finance_records`, `employees` referansları → P0-2.)_
12. **LLM'e hardcoded schema vermek** — NLP prompt'unda tablo/kolon listesi **`Base.metadata`'dan otomatik** üretilmeli. Manuel yazılan schema modellerle drift olur ve LLM hatalı SQL üretir. Bkz. `app/services/_schema_doc.py` (P0-5).
13. **JWT veya refresh token'ı `localStorage`'a koyma** — XSS riski. Access token bellek (modül scope), refresh token **HttpOnly + Secure + SameSite=Lax cookie**. Bkz. `.cursor/rules/security.mdc`.
14. **NLP SQL validator'da keyword string-match** — `"DELETE" in sql.upper()` "deletion_at" kolon adında false-positive üretir. AST tabanlı kontrol (`sqlglot.expressions.Delete` vs.) kullan.
15. **Bir iş akışında birden fazla `db.commit()`** — kısmi başarı = tutarsız DB. Ara `db.flush()`, sonda tek `commit()` (veya `with db.begin():`).
16. **`_ADMIN_TENANT_ID = 1` gibi magic number kullanma** — admin tespiti rol veya `Tenant.is_platform_admin` kolonu üzerinden olmalı.
17. **Para hesabında `Decimal → float` dönüşümü erken yapma** — kuruş kaybı. Hesaplama boyunca `Decimal`, sadece response'a serialize ederken `float`.

> **Audit ihlal listesi:** Bu kuralları zaten ihlal eden mevcut kod parçaları `.cursor/ACTION_PLAN.md` içinde **P0/P1 görevleri** olarak listelidir. Yeni kod yazarken bu listeyi kontrol et.

---

## 7. Sohbet protokolü (AI asistanlar için)

### Yeni sohbet başında
1. **`.cursor/PROGRESS.md`** dosyasını oku — son durum, aktif faz, açık sorular orada.
2. Aktif plan dosyası varsa (`c:\Users\pc\.cursor\plans\future_erp_*.plan.md`) onu da oku.
3. Kullanıcıya kısa özet ver: "Son kaldığımız yer: [X]. Sonraki adım: [Y]. Devam edelim mi?"

### Çalışma sırasında
- Karmaşık iş için Plan Mode'u öner.
- Her büyük adım sonrası küçük commit (Conventional).
- Tehlikeli komut (rm -rf, force push, drop table) → onay iste.

### Sohbet sonunda
- `.cursor/PROGRESS.md` dosyasının başına yeni günlük girdisi ekle:
  ```markdown
  ## YYYY-MM-DD — kısa başlık
  - Ne yapıldı (madde madde)
  - Sonraki adım
  - Açık sorular / takıldığımız yerler
  ```
- Aktif plan dosyasındaki todo durumlarını güncelle.

---

## 8. Faz haritası (özet)

| Faz | İçerik | Durum |
|---|---|---|
| **0** | Git + eklentiler + Alembic + seed + logging + pytest + Vitest iskeleti | Tamamlandı |
| **1** | Auth + RBAC + multi-tenant + admin/manager/employee UI çekirdeği | **Çekirdek tamam** (SQLite; JWT access/refresh, `/api/auth/login` + `/api/auth/signup`, `User` HR alanları `full_name`/`department`, frontend Login/Signup/Dashboard/Admin). **Ek (UX):** WebSocket AI bildirimleri (`/api/ws/notifications`), Topbar bildirim merkezi (mute, toast limiti), stok **Actionable AI** (`/api/inventory/{id}/auto-draft`, `is_ai_override`), HR performans API. Postgres geçişi **Faz 2** |
| **2** | CRM + Satınalma + Muhasebe (light) + Çoklu depo + HR + Doc + Raporlama + Bildirim (Redis/Celery) | Bekliyor (gerçek zamanlı kuyruk; dev WS + UI hazır) |
| **3** | TR lokalizasyon + e-Fatura + Agentic NLP + Excel auto-import + Anomali + WhatsApp bot + Perakende şablonu | Bekliyor |
| **4** | SaaS multi-tenant + abonelik (Stripe/İyzico) + PWA + marketing | Bekliyor |

Detay için: `c:\Users\pc\.cursor\plans\future_erp_*.plan.md`.

---

## 9. Hızlı referanslar

- Backend giriş noktası: [app/main.py](app/main.py)
- Router birleştirici: [app/api/router.py](app/api/router.py)
- DB config: [app/core/db.py](app/core/db.py)
- Frontend giriş: [frontend/src/App.tsx](frontend/src/App.tsx)
- API client: [frontend/src/lib/api.ts](frontend/src/lib/api.ts)
- WS bildirim (dev): [app/api/routes/ws_notifications.py](app/api/routes/ws_notifications.py) · hub: [app/realtime/notification_ws_hub.py](app/realtime/notification_ws_hub.py) · UI: [frontend/src/components/layout/NotificationBell.tsx](frontend/src/components/layout/NotificationBell.tsx)
- Pytest: kök `pytest` (geliştirme: `requirements-dev.txt`).
- Vitest: `cd frontend && npm run test`.
- **Audit raporu:** [PROJECT_AUDIT_REPORT.md](PROJECT_AUDIT_REPORT.md) (2026-05-19)
- **Atomik fix planı:** [.cursor/ACTION_PLAN.md](.cursor/ACTION_PLAN.md)

---

## 10. Bilinen sorunlar & audit kararları (2026-05-19)

> **Bu bölüm her audit sonrası güncellenir.** Detay: [PROJECT_AUDIT_REPORT.md](PROJECT_AUDIT_REPORT.md). Görevler: [.cursor/ACTION_PLAN.md](.cursor/ACTION_PLAN.md).

### 10.1. P0 — production-blocker (çözülmeden demo yok)

| # | Bug | Dosya | Plan |
|---|---|---|---|
| 1 | WS JWT `tid` yerine `tenant_id` okunuyor → admin tenant'a sızıntı | `app/api/routes/ws_notifications.py:35` | ACTION_PLAN P0-1 |
| 2 | `finance_records`, `employees` modelsiz tablo referansı → runtime 500 | `services/anomaly_service.py`, `services/nlp_assistant.py`, `core/module_config.py` | ACTION_PLAN P0-2 |
| 3 | `stock_movements.quantity_change` ham SQL bug'ı (gerçek kolon `change`) | `services/anomaly_service.py:202-247` | ACTION_PLAN P0-3 |
| 4 | Sales route'unda ham `db.execute(select(...))` → katman ihlali | `api/routes/sales.py:86-108` | ACTION_PLAN P0-4 |
| 5 | NLP schema prompt'u modellerle drift; LLM yanlış kolon adlarıyla SQL üretiyor | `services/nlp_assistant.py:244-282` | ACTION_PLAN P0-5 |

### 10.2. P1 — güvenlik & mimari (1-2 hafta)

- Refresh token `localStorage` → HttpOnly cookie (P1-1)
- `TenantScopedService` taban sınıfı (zorunlu kuraldı, eksikti) (P1-2)
- NLP `_validate_sql` AST tabanlı yeniden yaz (P1-3)
- Admin impersonation audit log tablosu (P1-4)
- `_ADMIN_TENANT_ID = 1` magic number kaldır (P1-5)
- Transaction normalize (sales/products service çift commit) (P1-6)
- `settings.is_production` property (ENV "prod" vs "production" tutarsızlığı) (P1-7)
- Multi-tenant izolasyon test seti (her endpoint için cross-tenant leak guard) (P1-8)

### 10.3. P2 — kalite & ürünleştirme (sonra)

Frontend React Query, lazy loading, error boundary; CI/CD (GitHub Actions); Docker; Sentry; Postgres geçişi; Redis+Celery; Customer-SalesRecord ilişkisi; KDV kolonu; multi-warehouse iskelet; Cmd+K palette. Detay: `.cursor/ACTION_PLAN.md` P2 bloğu.

### 10.4. Audit kararları (kalıcı kurallar)

Yeni audit'lerde bu kararlar tekrar tartışılmasın diye buraya pin'lendi:

- **`finance_records` tablosu yok ve eklenmeyecek.** Finans hesabı `sales_records + sales_items` üzerinden yapılır (`finance_service.summary`). Faz 2'de Finance modülü yeniden ele alınınca **yeni isim + yeni model** ile gelir.
- **`employees` tablosu Faz 2'de gelecek.** Şimdilik HR performans skoru `users` tablosundan proxy hesaplanır (`hr_performance_service`).
- **WebSocket auth:** JWT `tid` claim'i tek doğru kaynak. URL query string'inde token taşımak **geçici dev çözümü**; Faz 2'de WS subprotocol veya kısa-ömürlü WS ticket'a geçilecek.
- **Multi-tenant kuralı tek istisnasız:** Admin role bile cross-tenant veriye eriştiğinde `audit_logs` tablosuna yazmalı (P1-4 sonrası).
- **NLP prompt schema = `Base.metadata` çıktısı.** Manuel schema yazımı yasak (P0-5 sonrası).

---

> **Bu dosya yaşar.** Mimari karar değişirse, yeni modül eklenirse, kural güncellenirse buraya yansıt. AI asistanlar burayı "tek doğru kaynak" kabul eder.
