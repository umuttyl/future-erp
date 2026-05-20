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
from app.core.deps import AuthPrincipal, get_current_principal
from app.core.security import hash_password
from app.main import create_app
from app.models.base import Base
from app.models.tenant import Tenant
from app.models.user import User


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
def test_tenant(db_session: Session) -> Tenant:
    t = Tenant(name="Test Tenant", slug="test-tenant")
    db_session.add(t)
    db_session.flush()
    return t


@pytest.fixture
def test_admin(db_session: Session, test_tenant: Tenant) -> User:
    u = User(
        tenant_id=test_tenant.id,
        email="admin@test.com",
        password_hash=hash_password("Secret123"),
        full_name="Test Admin",
        department="IT",
        role="admin",
        is_active=True,
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def test_employee(db_session: Session, test_tenant: Tenant) -> User:
    u = User(
        tenant_id=test_tenant.id,
        email="employee@test.com",
        password_hash=hash_password("Secret123"),
        full_name="Test Employee",
        department="Satış",
        role="employee",
        is_active=True,
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def client(
    db_session: Session, test_tenant: Tenant, test_admin: User
) -> Generator[TestClient, None, None]:
    """get_db + admin principal override."""
    application = create_app()
    principal = AuthPrincipal(
        user_id=test_admin.id,
        tenant_id=test_tenant.id,
        email=test_admin.email,
        role="admin",
    )

    def _override_db() -> Generator[Session, None, None]:
        yield db_session

    application.dependency_overrides[get_db] = _override_db
    application.dependency_overrides[get_current_principal] = lambda: principal
    try:
        with TestClient(application) as tc:
            yield tc
    finally:
        application.dependency_overrides.clear()


@pytest.fixture
def client_employee(
    db_session: Session, test_tenant: Tenant, test_employee: User
) -> Generator[TestClient, None, None]:
    application = create_app()
    principal = AuthPrincipal(
        user_id=test_employee.id,
        tenant_id=test_tenant.id,
        email=test_employee.email,
        role="employee",
    )

    def _override_db() -> Generator[Session, None, None]:
        yield db_session

    application.dependency_overrides[get_db] = _override_db
    application.dependency_overrides[get_current_principal] = lambda: principal
    try:
        with TestClient(application) as tc:
            yield tc
    finally:
        application.dependency_overrides.clear()


@pytest.fixture
def client_no_auth(db_session: Session) -> Generator[TestClient, None, None]:
    application = create_app()

    def _override_db() -> Generator[Session, None, None]:
        yield db_session

    application.dependency_overrides[get_db] = _override_db
    try:
        with TestClient(application) as tc:
            yield tc
    finally:
        application.dependency_overrides.clear()


@pytest.fixture
def client_for(db_session: Session):
    """Factory fixture: herhangi bir User için yetkili TestClient döner."""
    _active: list[TestClient] = []

    def _make(user: User) -> TestClient:
        application = create_app()
        principal = AuthPrincipal(
            user_id=user.id,
            tenant_id=user.tenant_id,
            email=user.email,
            role=user.role,
        )

        def _override_db() -> Generator[Session, None, None]:
            yield db_session

        application.dependency_overrides[get_db] = _override_db
        application.dependency_overrides[get_current_principal] = lambda: principal
        tc = TestClient(application, raise_server_exceptions=False)
        tc.__enter__()
        _active.append(tc)
        return tc

    yield _make

    for tc in _active:
        try:
            tc.__exit__(None, None, None)
        except Exception:
            pass
