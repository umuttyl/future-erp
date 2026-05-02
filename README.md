# Future ERP

> KOBİ'ler için **AI-first agentic ERP** — bitirme tezi + ürünleştirme hedefli proje.

FastAPI + React 19 tabanlı, katmanlı ERP iskeleti. Detaylı vizyon, mimari kararlar ve kod kuralları için [`AGENTS.md`](AGENTS.md) dosyasına bakın.

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
├── scripts/              # Seed, yardımcı scriptler
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
```

### Frontend

```powershell
cd frontend
npm install
```

## Ortam değişkenleri

Kökte `.env` oluşturun (örnek için `.env.example`'a bakın):

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

## Geliştirici kuralları

Proje çalışmaya başlamadan önce [`AGENTS.md`](AGENTS.md) ve [`.cursor/rules/`](./.cursor/rules/) dosyalarını okuyun. Kod stili, mimari kararlar, multi-tenant + RBAC kuralları orada.

## Lisans

(Henüz lisans eklenmemiş.)
