## Future ERP AI

FastAPI tabanlı, katmanlı ERP iskeleti.

### Klasör yapısı

- `app/api`: Router'lar (HTTP uçları)
- `app/core`: Config, veritabanı, altyapı
- `app/models`: SQLAlchemy ORM modelleri
- `app/schemas`: Pydantic şemaları (request/response)
- `app/services`: İş mantığı / servis katmanı
- `app/ai_engine`: AI/forecast akışı (örnek iskelet)

### Gereksinimler

- Python 3.11+
- PostgreSQL

### Kurulum (Windows / PowerShell)

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### Ortam değişkenleri

`.env` oluşturun:

```env
PROJECT_NAME=Future ERP AI
ENV=dev
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/future_erp_ai
AUTO_CREATE_DB=true
```

`AUTO_CREATE_DB=true` iken (sadece `ENV=dev`), PostgreSQL çalışıyorsa uygulama başlangıcında veritabanı yoksa oluşturmayı dener.

### PostgreSQL olmadan çalıştırma (SQLite)

Sadece deneme amaçlı PostgreSQL kurmadan çalıştırmak için:

```env
ENV=dev
DATABASE_URL=sqlite:///./future_erp_ai.db
AUTO_CREATE_DB=false
```

### DB oluşturma (tek komut)

PostgreSQL çalışıyorken:

```bash
python scripts/create_db.py
```

### Çalıştırma

```bash
uvicorn app.main:app --reload
```

İlk çalıştırmada tablolar otomatik oluşturulur (dev amaçlı).

