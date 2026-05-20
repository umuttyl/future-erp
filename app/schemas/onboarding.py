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


class OnboardingSetupRequest(BaseModel):
    """Manager'ın onboarding sırasında göndereceği istek."""
    sector: str
    active_modules: list[str]

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
    )
