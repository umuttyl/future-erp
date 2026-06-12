"""Alembic environment yapılandırması.

DATABASE_URL'i `app.core.config.settings`'ten okur, böylece tek bir
gerçek doğru kaynak (.env) hem uygulama hem de migration'lar için kullanılır.

SQLite için `render_as_batch=True` aktif — SQLite ALTER TABLE'ı kısıtlı
desteklediği için Alembic "batch mode" ile geçici tablolar üzerinden
değişiklikleri uygular. Postgres'e geçişte de sorun çıkarmaz.
"""
from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine.url import make_url

from alembic import context

# ---------------------------------------------------------------------------
# Proje kökünü sys.path'e ekle ki `from app...` çalışsın.
# ---------------------------------------------------------------------------
sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.models.base import Base  # noqa: E402

# Tüm modeller import edilmeli ki Base.metadata onları bilsin.
import app.models  # noqa: F401, E402


# ---------------------------------------------------------------------------
# Alembic Config
# ---------------------------------------------------------------------------
config = context.config

# DATABASE_URL'i dış config'ten al (alembic.ini'deki placeholder yerine).
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Logging yapılandırması.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Autogenerate hedefi.
target_metadata = Base.metadata


def _is_sqlite() -> bool:
    return make_url(settings.DATABASE_URL).drivername.startswith("sqlite")


def run_migrations_offline() -> None:
    """SQL script üretmek için offline mod."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        render_as_batch=_is_sqlite(),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Gerçek DB bağlantısı üzerinden migration çalıştır."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            render_as_batch=_is_sqlite(),
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
