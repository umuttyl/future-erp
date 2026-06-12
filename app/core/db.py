"""Veritabanı motoru ve session yönetimi.

Schema oluşturma SORUMLULUĞU bu modülde DEĞİLDİR — Alembic'e devredilmiştir.
Tablo oluşturmak için: ``alembic upgrade head``
Yeni migration üretmek için: ``alembic revision --autogenerate -m "..."``
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


_url = make_url(settings.DATABASE_URL)
if _url.drivername.startswith("sqlite"):
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: route içinde DB session enjekte eder."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
