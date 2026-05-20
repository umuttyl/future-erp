"""P1-7: settings.is_production property testleri."""

from __future__ import annotations

import pytest


_STRONG_KEY = "a" * 64  # 64 char, production-safe test key


def test_is_production_accepts_prod(monkeypatch):
    monkeypatch.setenv("ENV", "prod")
    from app.core.config import Settings
    assert Settings(JWT_SECRET_KEY=_STRONG_KEY).is_production is True


def test_is_production_accepts_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    from app.core.config import Settings
    assert Settings(JWT_SECRET_KEY=_STRONG_KEY).is_production is True


def test_is_production_dev_is_false(monkeypatch):
    monkeypatch.setenv("ENV", "dev")
    from app.core.config import Settings
    assert Settings().is_production is False


def test_is_production_staging_is_false(monkeypatch):
    monkeypatch.setenv("ENV", "staging")
    from app.core.config import Settings
    assert Settings().is_production is False


def test_jwt_validator_rejects_default_key_in_prod(monkeypatch):
    """ENV=prod ile varsayılan JWT anahtarı kabul edilmemeli."""
    monkeypatch.setenv("ENV", "prod")
    from app.core.config import Settings, _DEFAULT_JWT_KEY
    with pytest.raises(Exception):
        Settings(JWT_SECRET_KEY=_DEFAULT_JWT_KEY)


def test_jwt_validator_rejects_short_key_in_production(monkeypatch):
    """ENV=production ile kısa JWT anahtarı kabul edilmemeli."""
    monkeypatch.setenv("ENV", "production")
    from app.core.config import Settings
    with pytest.raises(Exception):
        Settings(JWT_SECRET_KEY="short-key")
