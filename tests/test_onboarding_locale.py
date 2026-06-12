"""C: Onboarding currency + language kaydı (global iş temeli)."""

from __future__ import annotations


def test_onboarding_saves_currency_and_language(client, db_session, test_tenant):
    r = client.post(
        "/api/onboarding/setup",
        json={
            "sector": "retail",
            "active_modules": ["sales", "inventory"],
            "currency": "USD",
            "language": "en",
        },
    )
    assert r.status_code == 200
    db_session.refresh(test_tenant)
    assert test_tenant.currency == "USD"
    assert test_tenant.language == "en"


def test_onboarding_defaults_currency_language(client, db_session, test_tenant):
    """currency/language gönderilmezse TRY/tr varsayılanı uygulanır."""
    r = client.post(
        "/api/onboarding/setup",
        json={"sector": "retail", "active_modules": ["sales"]},
    )
    assert r.status_code == 200
    db_session.refresh(test_tenant)
    assert test_tenant.currency == "TRY"
    assert test_tenant.language == "tr"


def test_onboarding_rejects_unsupported_currency(client):
    r = client.post(
        "/api/onboarding/setup",
        json={
            "sector": "retail",
            "active_modules": ["sales"],
            "currency": "XYZ",
            "language": "tr",
        },
    )
    assert r.status_code == 422


def test_onboarding_config_exposes_supported_locales(client):
    r = client.get("/api/onboarding/config")
    assert r.status_code == 200
    data = r.json()
    assert "TRY" in data["supported_currencies"]
    assert "USD" in data["supported_currencies"]
    assert "tr" in data["supported_languages"]
    assert "en" in data["supported_languages"]


def test_company_profile_update_currency_language(client, db_session, test_tenant):
    """Mevcut şirket Settings'ten para birimi/dil değiştirebilir."""
    r = client.patch(
        "/api/onboarding/profile",
        json={"currency": "EUR", "language": "en"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "EUR"
    assert body["language"] == "en"
    assert "TRY" in body["supported_currencies"]
    db_session.refresh(test_tenant)
    assert test_tenant.currency == "EUR"
    assert test_tenant.language == "en"


def test_company_profile_rejects_bad_currency(client):
    r = client.patch("/api/onboarding/profile", json={"currency": "XYZ"})
    assert r.status_code == 422
