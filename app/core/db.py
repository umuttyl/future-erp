from collections.abc import Generator

import psycopg
from psycopg import sql
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.base import Base


_url = make_url(settings.DATABASE_URL)
if _url.drivername.startswith("sqlite"):
    engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_database_exists() -> None:
    """
    Dev kolaylığı: DATABASE_URL'deki DB yoksa oluşturmayı dener.

    Not: Bu işlem için Postgres sunucusuna bağlanabilmek gerekir.
    Timeout/host unreachable gibi durumlarda DB oluşturma denenmez.
    """
    url = make_url(settings.DATABASE_URL)
    if not url.drivername.startswith("postgresql"):
        return

    db_name = url.database
    if not db_name:
        return

    admin_db = "postgres"
    admin_url = url.set(database=admin_db)

    try:
        with psycopg.connect(str(admin_url)) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM pg_database WHERE datname = %s",
                    (db_name,),
                )
                exists = cur.fetchone() is not None
                if not exists:
                    cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))
    except psycopg.OperationalError as e:
        msg = str(e).lower()
        if "timeout" in msg or "could not connect" in msg or "connection refused" in msg:
            return
        raise


def init_db() -> None:
    # Dev amaçlı otomatik tablo oluşturma (prod için migration önerilir).
    try:
        if settings.ENV == "dev" and settings.AUTO_CREATE_DB:
            ensure_database_exists()
        Base.metadata.create_all(bind=engine)
    except OperationalError as e:
        raise RuntimeError(
            "Database connection failed. Check PostgreSQL is running and DATABASE_URL is correct."
        ) from e

