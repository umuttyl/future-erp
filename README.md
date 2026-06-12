# Future ERP

> ### _**"İşletmen senden bir adım önde."**_
> AI destekli iş ortağın. **Düşünür, önerir, eyler.**

5-10 kişilik küçük işletmeler için **AI-first agentic ERP** — her sayfada proaktif çalışan yapay zeka destekli iş yönetim sistemi. Bitirme tezi + ürünleştirme hedefli proje.

FastAPI + React 19 tabanlı, katmanlı ERP iskeleti.

> 📍 **Geliştirme durumu (2026-06-12):**
> - **P0 production-blocker bug'lar:** ✅ tamamlandı
> - **P1 güvenlik & mimari:** ✅ tamamlandı
> - **P2 frontend modernizasyon:** ✅ tamamlandı
> - **Strateji revizyonu:** Tamamlandı — 4 katmanlı RBAC + AI Co-pilot paradigması + yeni modüller (CASHBOOK, ACCOUNTS, TEAM, sektör eklentileri)

## Future ERP Neden Farklı?

KOBİ ERP pazarında **5 ana farklılaştırıcı** — hiçbiri rakiplerde yok:

1. **AI Co-pilot Panel** — her sayfada sağ tarafta bağlamsal yardım (3 mod: kapalı/mini/açık)
2. **5 Uzman AI Sistemi** — Satış / Stok / Finans / Ekip / Pazarlama uzmanları
3. **Sabah Brifingi** — her gün proaktif öneri kartları + tek tık eylem
4. **AI Analiz Sayfası = Strateji Tahtası** — Manşet + özelleştirilebilir tahta + 5 uzman sesi
5. **Granüler İzin Matrisi** — AI eylem yetkisini patron tek tek belirler

**Hedef pazar:** Perakende, B2B toptan/bayilik, küçük hizmet, küçük üretim, proje bazlı iş.
**Kapsam dışı:** Restoran sektörü, TR yasal uyum (e-Fatura), sesli komut, WhatsApp, mobile-first.

## Tech Stack

| Katman | Teknoloji |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic |
| Frontend | React 19, Vite, TypeScript, Tailwind v3, Recharts |
| Veritabanı | SQLite (Faz 0 — dev), PostgreSQL (Faz 1+) |
| AI | OpenAI / Gemini, Prophet (forecast) |

## Klasör yapısı

```
Future_Erp/
├── app/                  # Backend (FastAPI)
│   ├── api/routes/       # HTTP endpointleri
│   ├── core/             # config, db
│   ├── models/           # SQLAlchemy modelleri
│   ├── schemas/          # Pydantic şemaları
│   └── services/         # İş mantığı
├── frontend/             # React 19 + Vite + TS
├── migrations/           # Alembic migration'ları
└── tests/                # pytest API / servis testleri
```

## Gereksinimler

- Python 3.11+
- Node.js 20+
- (Faz 1+) PostgreSQL 14+

## Kurulum

### Backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Testler için (pytest, httpx):
pip install -r requirements-dev.txt
```

### Frontend

```powershell
cd frontend
npm install
```

## Ortam değişkenleri

**Varsayılan (`.env` yoksa):** uygulama ve Alembic aynı dosyayı kullanır — `sqlite:///./future_erp_ai.db` (proje kökünde oluşur). PostgreSQL yapılandırılmadığı sürece ek bir DB sunucusu gerekmez.

Kökte `.env` oluşturmak için `.env.example` dosyasını kopyalayın:

```env
PROJECT_NAME=Future ERP
ENV=dev
DATABASE_URL=sqlite:///./future_erp_ai.db
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-flash-latest
```

> **Faz 1 sonrası** Postgres'e geçiş:
> ```env
> DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/future_erp_ai
> ```

## Veritabanı yönetimi

Schema yönetimi tamamen **Alembic** ile yapılır.

### İlk kurulum / güncelleme

```powershell
alembic upgrade head
```

### Yeni migration üretme (model değişimi sonrası)

```powershell
alembic revision --autogenerate -m "açıklama"
alembic upgrade head
```

### Geri alma

```powershell
alembic downgrade -1
```

## Geliştirme verisi

```powershell
# Tablolar zaten oluştuktan sonra örnek veri:
python scripts/seed_data.py

# Tabloları sıfırlayıp yeniden doldur (DEV-ONLY):
python scripts/seed_data.py --reset
```

## Çalıştırma

### Backend

```powershell
uvicorn app.main:app --reload
```

API: http://localhost:8000/api
Docs: http://localhost:8000/docs

### Frontend

```powershell
cd frontend
npm run dev
```

UI: http://localhost:5173

## Canlı AI bildirimleri (geliştirme)

- **WebSocket:** `GET` → `/api/ws/notifications?access_token=…` (JWT access; `ai.insights.read` izni). Vite proxy’de `/api` için WebSocket açık olmalı.
- **Simülasyon:** `ENV != prod` iken arka planda anomali döngüsü; ürün başına **10 dk** tekrar engeli (cooldown).
- **Frontend:** Topbar bildirim zili — liste, okunmamış rozeti, **Sustur** (toast kapatır; liste açık kalır), aynı anda en fazla **2** toast; bildirimden **Sipariş taslağı** → `POST /api/inventory/{id}/auto-draft?is_ai_override=true`.
- **Stok derin bağlantı:** `/stock?productId={id}` ile ilgili satıra kaydırma.

## Test

### Backend — pytest

```powershell
.\.venv\Scripts\Activate.ps1
pytest
```

`tests/conftest.py` ortak in-memory SQLite kullanır; `.env` ile tanımlı dosya veritabanına yazmaz.

### Frontend — Vitest

```powershell
cd frontend
npm run test          # tek sefer
npm run test:watch    # izleme
```

## Geliştirici kuralları

### Faz haritası (özet)

| Faz | İçerik | Durum |
|---|---|---|
| **0** | Git + Alembic + seed + logging + pytest iskeleti | ✅ Tamam |
| **1** | Auth + RBAC + multi-tenant çekirdeği | ✅ Tamam |
| **1.5** | P0/P1/P2 audit fix'leri + frontend modernizasyon | ✅ Tamam |
| **2A** | Mimari yenileme (4 katmanlı RBAC: PlatformUser + Owner/Staff + JobRoleTemplate) | 🔜 **Aktif sıradaki** |
| **2B** | Temel modüller: CASHBOOK, ACCOUNTS, TEAM, sipariş→fatura akışı, stok sayımı, audit log, yedek | Bekliyor |
| **2C** | AI Co-pilot Panel + 5 Uzman AI + Strateji Tahtası + UX modernize (shadcn/ui + Cmd+K) | Bekliyor |
| **3** | Sektör eklentileri (POS, WHOLESALE, TIME, RECIPE, PROJECTS) + Granüler İzin Matrisi + AI Memory | Bekliyor |
| **4** | Otonom AI + tablet uyumluluk + 3. taraf eklenti ekosistemi | Sonra |

### Modül listesi

**Çekirdek (her tenant için):**
SALES (Satış), INVENTORY (Stok), CRM (Müşteri), **CASHBOOK** 🆕 (Kasa & Banka), **ACCOUNTS** 🆕 (Cari Hesap), AI

**Eklenti:**
SUPPLIERS (Tedarikçi), PURCHASING (Satınalma), **TEAM** 🆕 (Ekip — eski HR'ın yerine; performans, görev, komisyon, izin)

**Sektör eklentileri (otomatik açılır):**
POS (perakende), **WHOLESALE** 🆕 (B2B toptan), TIME (hizmet), RECIPE (üretim/BOM), PROJECTS (proje bazlı)

### Bilinen sorunlar

**P0 (production-blocker):** ✅ **Hepsi tamamlandı** (5/5)
**P1 (güvenlik & mimari):** ✅ **Hepsi tamamlandı** (8/8)
**P2 (frontend modernizasyon):** ✅ **Çekirdek tamam** (6/6 — React Query, lazy loading, ErrorBoundary, TypeScript strict, token storage, pip-compile)

## Lisans

(Henüz lisans eklenmemiş.)
