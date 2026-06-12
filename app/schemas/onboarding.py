"""Onboarding şemaları — sektör seçimi ve modül konfigürasyonu."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator

from app.core.module_config import (
    ALL_MODULES,
    MODULE_META,
    SECTOR_META,
    SECTOR_TEMPLATES,
    SectorKey,
    validate_modules,
)


# Desteklenen para birimleri (ISO 4217) ve diller (ISO 639-1) — global temel.
SUPPORTED_CURRENCIES = {"TRY", "USD", "EUR", "GBP"}
SUPPORTED_LANGUAGES = {"tr", "en"}


class OnboardingSetupRequest(BaseModel):
    """Manager'ın onboarding sırasında göndereceği istek."""
    sector: str
    active_modules: list[str]
    currency: str = "TRY"
    language: str = "tr"

    @field_validator("sector")
    @classmethod
    def validate_sector(cls, v: str) -> str:
        valid = {
            SectorKey.RETAIL, SectorKey.RESTAURANT, SectorKey.SERVICE,
            SectorKey.PRODUCTION, SectorKey.CONSTRUCTION, SectorKey.OTHER,
        }
        if v not in valid:
            raise ValueError(f"Geçersiz sektör: {v}. Geçerli değerler: {valid}")
        return v

    @field_validator("active_modules")
    @classmethod
    def validate_active_modules(cls, v: list[str]) -> list[str]:
        cleaned = validate_modules(v)
        if not cleaned:
            raise ValueError("En az bir modül seçilmelidir.")
        return cleaned

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        v = (v or "TRY").upper()
        if v not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Desteklenmeyen para birimi: {v}")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        v = (v or "tr").lower()
        if v not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Desteklenmeyen dil: {v}")
        return v


class ModuleInfo(BaseModel):
    """Tek bir modülün meta bilgisi."""
    key: str
    label: str
    icon: str
    description: str
    is_active: bool


class SectorInfo(BaseModel):
    """Tek bir sektörün meta bilgisi."""
    key: str
    label: str
    icon: str
    description: str
    default_modules: list[str]


class OnboardingConfigResponse(BaseModel):
    """Onboarding sayfasının ihtiyaç duyduğu tüm konfigürasyon verisi."""
    sectors: list[SectorInfo]
    all_modules: list[ModuleInfo]
    current_sector: Optional[str]
    current_modules: list[str]
    onboarding_completed: bool
    currency: str = "TRY"
    language: str = "tr"
    supported_currencies: list[str] = []
    supported_languages: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class TenantModulesUpdateRequest(BaseModel):
    """Ayarlar sayfasından modül açma/kapatma isteği."""
    active_modules: list[str]

    @field_validator("active_modules")
    @classmethod
    def validate_modules_field(cls, v: list[str]) -> list[str]:
        cleaned = validate_modules(v)
        if not cleaned:
            raise ValueError("En az bir modül aktif olmalıdır.")
        return cleaned


class TenantModulesResponse(BaseModel):
    """Güncel modül durumu."""
    sector: Optional[str]
    active_modules: list[str]
    onboarding_completed: bool

    model_config = ConfigDict(from_attributes=True)


def build_onboarding_config(tenant) -> OnboardingConfigResponse:
    """Tenant nesnesinden onboarding konfigürasyon yanıtı oluşturur."""
    current_modules = tenant.active_modules

    sectors = [
        SectorInfo(
            key=key,
            label=meta["label"],
            icon=meta["icon"],
            description=meta["description"],
            default_modules=SECTOR_TEMPLATES.get(key, []),
        )
        for key, meta in SECTOR_META.items()
    ]

    all_modules = [
        ModuleInfo(
            key=key,
            label=meta["label"],
            icon=meta["icon"],
            description=meta["description"],
            is_active=key in current_modules,
        )
        for key, meta in MODULE_META.items()
    ]

    return OnboardingConfigResponse(
        sectors=sectors,
        all_modules=all_modules,
        current_sector=tenant.sector,
        current_modules=current_modules,
        onboarding_completed=tenant.onboarding_completed,
        currency=getattr(tenant, "currency", "TRY"),
        language=getattr(tenant, "language", "tr"),
        supported_currencies=sorted(SUPPORTED_CURRENCIES),
        supported_languages=sorted(SUPPORTED_LANGUAGES),
    )
