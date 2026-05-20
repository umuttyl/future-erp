# Future ERP

> KOBİ'ler için **AI-first agentic ERP** — bitirme tezi + ürünleştirme hedefli proje.

FastAPI + React 19 tabanlı, katmanlı ERP iskeleti. Detaylı vizyon, mimari kararlar ve kod kuralları için [`AGENTS.md`](AGENTS.md) dosyasına bakın.

> ⚠️ **Geliştirme durumu (2026-05-19):** Proje kapsamlı bir denetimden geçti. **5 production-blocker bug (P0)** ve 8 güvenlik/mimari iyileştirme (P1) tespit edildi. Demo veya deploy yapmadan önce [`PROJECT_AUDIT_REPORT.md`](PROJECT_AUDIT_REPORT.md) raporunu ve [`.cursor/ACTION_PLAN.md`](.cursor/ACTION_PLAN.md) atomik fix planını inceleyin.

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
├── tests/                # pytest API / servis testleri
└── AGENTS.md             # AI agent talimatları (proje vizyonu, kurallar)
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

Proje çalışmaya başlamadan önce şunları okuyun:

1. **[`AGENTS.md`](AGENTS.md)** — proje vizyonu, stack, mimari kararlar, "asla yapma" kırmızı çizgiler ve §10 "Bilinen sorunlar & audit kararları".
2. **[`.cursor/rules/`](./.cursor/rules/)** — backend, frontend, security, tests için ayrıntılı standartlar (her audit sonrası güncellenir).
3. **[`PROJECT_AUDIT_REPORT.md`](PROJECT_AUDIT_REPORT.md)** — son kod denetiminin tam çıktısı; bulgular, öneriler, 6 haftalık yol haritası.
4. **[`.cursor/ACTION_PLAN.md`](.cursor/ACTION_PLAN.md)** — audit bulgularını **Claude Code'un sırayla uygulayabileceği** atomik fix talimatlarına çevirir; her görev için dosya, satır, before/after kod, test, commit mesajı içerir.

### Geliştirme akışı (yeni sohbet protokolü)

**Audit görevlerine devam etmek için:**

```
@AGENTS.md, @.cursor/PROGRESS.md ve @.cursor/ACTION_PLAN.md oku.
ACTION_PLAN içinde `[ ]` olarak işaretli ilk görevi al,
talimatları uygula, testleri çalıştır, commit at, checkbox'ı `[x]` yap.
Tek görev bitirip dur, bana onay sor.
```

### Bilinen kritik sorunlar (özet)

| # | Sorun | Etki | Plan |
|---|---|---|---|
| P0-1 | WS multi-tenant veri sızıntısı (`tid` yerine `tenant_id` okunuyor) | **Yüksek**: bildirimler yanlış tenant'a gidiyor | ACTION_PLAN P0-1 |
| P0-2 | Hayalet tablolar (`finance_records`, `employees`) | Runtime 500 hatası | ACTION_PLAN P0-2 |
| P0-3 | `stock_movements.quantity_change` ham SQL bug'ı | Anomaly endpoint çöküyor | ACTION_PLAN P0-3 |
| P0-4 | Sales route'unda ham DB sorgusu (katman ihlali) | Mimari borç | ACTION_PLAN P0-4 |
| P0-5 | NLP schema prompt'u modellerle drift | LLM hatalı SQL üretiyor | ACTION_PLAN P0-5 |
| P1-1 | Refresh token localStorage'da (XSS riski) | Güvenlik | ACTION_PLAN P1-1 |
| P1-* | 7 ek P1 görevi | Güvenlik & mimari | ACTION_PLAN |

Tüm liste için [`PROJECT_AUDIT_REPORT.md`](PROJECT_AUDIT_REPORT.md).

## Lisans

(Henüz lisans eklenmemiş.)
