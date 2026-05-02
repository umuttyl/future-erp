"""Paylasilan test fixturelari.

SQLite in-memory ``StaticPool`` ile tablolari ``Base.metadata.create_all`` ile
olustururuz (Alembic disinda; **sadece test** için). Uretim ayarlarına yazma.
"""

from collections.abc import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

import app.models  # noqa: F401 — model kayitları için
from app.core.db import get_db
from app.main import create_app
from app.models.base import Base


@pytest.fixture(scope="session")
def test_engine():
    """Tek paylasilan in-memory SQLite (tum bağlantılar ayni DB görür)."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def db_session(test_engine) -> Generator[Session, None, None]:
    """Her test bagimsiz kalir: bağlantida transaction commit edilmez, rollback."""
    connection = test_engine.connect()
    trans = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    trans.rollback()
    connection.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """get_db yi test oturumu ile ez."""
    application = create_app()

    def _override_db() -> Generator[Session, None, None]:
        yield db_session

    application.dependency_overrides[get_db] = _override_db
    try:
        with TestClient(application) as tc:
            yield tc
    finally:
        application.dependency_overrides.clear()
