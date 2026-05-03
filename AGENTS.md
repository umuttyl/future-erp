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
| Bildirim/Queue | (Yok — Faz 2/3'te Redis + Celery) |
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
│   ├── ai_engine/        # Forecast/AI özel modülleri
│   └── main.py           # FastAPI app factory
├── frontend/             # React UI
│   └── src/
│       ├── pages/        # Sayfa bileşenleri
│       ├── components/   # Paylaşılan UI bileşenleri
│       ├── layout/       # AppShell, Sidebar
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
5. **Route içinde DB sorgusu** — service'e devret.
6. **Auth/RBAC kodunu testsiz merge etme.**
7. **Mevcut migration'ı geriye dönük düzenleme** — yeni migration ekle.
8. **Frontend'de plain `fetch`/`axios`** — `lib/api.ts` zorunlu.
9. **Türkçe karakter sorunlarını "şimdilik" geçme** — `tr-TR` locale doğru kurulmalı.

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
| **1** | Auth + RBAC + multi-tenant + admin/manager/employee UI çekirdeği | **Çekirdek tamam** (SQLite; JWT access/refresh, `/api/auth/login` + `/api/auth/signup`, `User` HR alanları `full_name`/`department`, frontend Login/Signup/Dashboard/Admin). Postgres geçişi **Faz 2** |
| **2** | CRM + Satınalma + Muhasebe (light) + Çoklu depo + HR + Doc + Raporlama + Bildirim | Bekliyor |
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
- Pytest: kök `pytest` (geliştirme: `requirements-dev.txt`).
- Vitest: `cd frontend && npm run test`.

---

> **Bu dosya yaşar.** Mimari karar değişirse, yeni modül eklenirse, kural güncellenirse buraya yansıt. AI asistanlar burayı "tek doğru kaynak" kabul eder.
