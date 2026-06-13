# Future ERP

> **"Your business, one step ahead."**
> An AI-first ERP that thinks, suggests, and acts — built for small teams.

AI-powered business management platform for 5–20 person companies. Every page has a proactive AI co-pilot that understands your data and works alongside you.

---

## Features

### Core Modules
| Module | Description |
|---|---|
| **Dashboard** | KPI cards, sparklines, morning briefing, AI anomaly alerts |
| **Sales** | Point-of-sale records, payment types, invoice PDF & e-Invoice XML |
| **Stock** | Product catalog, stock movements, reorder alerts, physical count |
| **Orders (B2B)** | Customer order → delivery note → invoice full pipeline |
| **Customers** | CRM with B2B/B2C segmentation, order & account history |
| **Suppliers** | Supplier management, auto-draft supply orders |
| **Finance** | Revenue analytics, top customers/products, monthly charts |
| **Cashbook** | Cash & bank accounts, transaction ledger, daily reports |
| **Accounts** | Customer account movements, balance tracking |
| **Expenses** | Expense tracking by category, period summaries |
| **HR / Team** | Task management, team performance, overdue tracking |
| **Settings** | Company profile, user management, role templates, modules |

### AI Features
| Feature | Description |
|---|---|
| **AI Co-pilot** | Context-aware chat panel on every page (collapsed / mini / full) |
| **NLP Chat** | Natural language queries over your own data ("show me top 5 customers this month") |
| **5 Expert AIs** | Separate expert agents for Sales, Inventory, Finance, Team, and Marketing |
| **Morning Briefing** | Daily proactive cards — critical stock, overdue tasks, sales vs. average |
| **AI Strategy Board** | Insights dashboard: headline card, customizable board, forecasting charts |
| **Sales Forecast** | Prophet-powered 30/60/90-day revenue & quantity forecasts |
| **Anomaly Detection** | Real-time WebSocket alerts for sales, stock, and finance anomalies |
| **Auto Supply Draft** | AI-generated reorder quantities based on demand forecast + current stock |

### Platform & Security
- **Multi-tenant** — full data isolation per company; single database, zero cross-tenant leakage
- **4-layer RBAC** — Platform Admin → Owner/Manager → Staff → Job Role Templates
- **JWT auth** — 15-min access token + 7-day refresh token, httpOnly cookie option
- **Audit log** — every admin impersonation and sensitive action is logged
- **Rate limiting** — per-IP on auth and AI endpoints
- **WebSocket notifications** — live anomaly push to connected clients

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v3, Recharts |
| Database | SQLite (dev) · PostgreSQL (production) |
| AI / ML | OpenAI / Gemini (NLP), Prophet (forecasting), scikit-learn (anomaly) |
| Auth | PyJWT, Argon2 password hashing |

---

## Project Structure

```
Future_Erp/
├── app/                        # FastAPI backend
│   ├── api/routes/             # HTTP & WebSocket endpoints
│   ├── core/                   # Config, DB, auth deps, permissions
│   ├── models/                 # SQLAlchemy ORM models
│   ├── schemas/                # Pydantic request/response schemas
│   └── services/               # Business logic layer
├── frontend/                   # React 19 + Vite + TypeScript
│   └── src/
│       ├── pages/              # Route-level page components
│       ├── components/         # Shared UI components
│       ├── api/                # Typed API client (React Query)
│       └── stores/             # Zustand global state
├── migrations/                 # Alembic migration files
├── scripts/                    # seed_data.py, dev utilities
└── tests/                      # pytest (backend) + Vitest (frontend)
```

---

## Requirements

- Python 3.11+
- Node.js 20+
- (Production) PostgreSQL 14+

---

## Setup

### 1. Clone & environment

```powershell
git clone https://github.com/umuttyl/future-erp.git
cd future-erp
cp .env.example .env
# Edit .env and set your AI API key (optional for core modules)
```

### 2. Backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run database migrations
alembic upgrade head
```

### 3. Frontend

```powershell
cd frontend
npm install
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```env
PROJECT_NAME=Future ERP AI
ENV=dev
DATABASE_URL=sqlite:///./future_erp_ai.db

# AI features (optional — core modules work without these)
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4o-mini
# or
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-flash-latest
```

**Production (PostgreSQL):**
```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/future_erp_ai
ENV=prod
```

---

## Running

Open two terminals:

**Terminal 1 — Backend** (port 8000)
```powershell
.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

**Terminal 2 — Frontend** (port 5173)
```powershell
cd frontend
npm run dev
```

| URL | Description |
|---|---|
| http://localhost:5173 | Application UI |
| http://localhost:8000/docs | Interactive API docs (Swagger) |
| http://localhost:8000/health | Health check |

---

## Demo Accounts

Seeded automatically on first run (`ENV=dev`):

| Role | Email | Password |
|---|---|---|
| Platform Admin | `admin@demo.example.com` | `Admin123!` |
| Manager | `demo@futuretech.io` | `Demo123!` |
| Staff | `staff@futuretech.io` | `Staff123!` |

---

## Database Management

```powershell
# Apply all pending migrations
alembic upgrade head

# Generate a new migration after model changes
alembic revision --autogenerate -m "description"

# Roll back one migration
alembic downgrade -1
```

**Seed demo data:**
```powershell
python scripts/seed_data.py          # add demo data
python scripts/seed_data.py --reset  # wipe and reseed (dev only)
```

---

## Testing

**Backend (pytest):**
```powershell
.\.venv\Scripts\Activate.ps1
pytest
```

**Frontend (Vitest):**
```powershell
cd frontend
npm run test          # single run
npm run test:watch    # watch mode
```

---

## License

MIT
