"""Onboarding endpoint'leri.

Manager kayıt sonrası sektör + modül seçimi yapar.
Ayarlar sayfasından modüller güncellenebilir.
"""
from __future__ import annotations

import os
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, get_current_principal, require_permission
from app.core.exceptions import AppException, NotFoundException
from app.core.permissions import ADMIN_ACCESS
from app.models.tenant import Tenant
from app.services.demo_data_service import clear_demo_data, seed_demo_data
from app.schemas.onboarding import (
    SUPPORTED_CURRENCIES,
    SUPPORTED_LANGUAGES,
    OnboardingConfigResponse,
    OnboardingSetupRequest,
    TenantModulesResponse,
    TenantModulesUpdateRequest,
    build_onboarding_config,
)

router = APIRouter()


def _get_tenant_or_404(db: Session, tenant_id: int) -> Tenant:
    tenant = db.get(Tenant, tenant_id)
    if tenant is None or not tenant.is_active:
        raise NotFoundException("Company not found.")
    return tenant


@router.get("/config", response_model=OnboardingConfigResponse)
def get_onboarding_config(
    principal: Annotated[AuthPrincipal, Depends(get_current_principal)],
    db: Session = Depends(get_db),
) -> OnboardingConfigResponse:
    """Onboarding / Ayarlar sayfası için mevcut konfigürasyonu döner.

    Tüm roller erişebilir; sadece kendi tenant'larının verisini görürler.
    """
    tenant = _get_tenant_or_404(db, principal.tenant_id)
    return build_onboarding_config(tenant)


@router.post("/setup", response_model=TenantModulesResponse)
def complete_onboarding(
    body: OnboardingSetupRequest,
    principal: Annotated[AuthPrincipal, Depends(require_permission("admin.users.write"))],
    db: Session = Depends(get_db),
) -> TenantModulesResponse:
    """Onboarding tamamlama — sektör ve modül seçimini kaydeder.

    Sadece admin ve manager rolü erişebilir (admin.users.write izni).
    Onboarding birden fazla kez çalıştırılabilir — ayarlar güncellenebilir.
    """
    tenant = _get_tenant_or_404(db, principal.tenant_id)

    tenant.sector = body.sector
    tenant.active_modules = body.active_modules
    tenant.currency = body.currency
    tenant.language = body.language
    tenant.onboarding_completed = True

    db.commit()
    db.refresh(tenant)

    return TenantModulesResponse(
        sector=tenant.sector,
        active_modules=tenant.active_modules,
        onboarding_completed=tenant.onboarding_completed,
    )


@router.patch("/modules", response_model=TenantModulesResponse)
def update_active_modules(
    body: TenantModulesUpdateRequest,
    principal: Annotated[AuthPrincipal, Depends(require_permission("admin.users.write"))],
    db: Session = Depends(get_db),
) -> TenantModulesResponse:
    """Ayarlar sayfasından modül açma/kapatma.

    Sadece admin ve manager rolü çalıştırabilir.
    """
    tenant = _get_tenant_or_404(db, principal.tenant_id)
    tenant.active_modules = body.active_modules
    db.commit()
    db.refresh(tenant)

    return TenantModulesResponse(
        sector=tenant.sector,
        active_modules=tenant.active_modules,
        onboarding_completed=tenant.onboarding_completed,
    )


@router.get("/modules", response_model=TenantModulesResponse)
def get_current_modules(
    principal: Annotated[AuthPrincipal, Depends(get_current_principal)],
    db: Session = Depends(get_db),
) -> TenantModulesResponse:
    """Mevcut aktif modül listesini döner.

    Frontend sidebar bu endpoint'i kullanarak dinamik menü oluşturur.
    Tüm roller erişebilir.
    """
    tenant = _get_tenant_or_404(db, principal.tenant_id)
    return TenantModulesResponse(
        sector=tenant.sector,
        active_modules=tenant.active_modules,
        onboarding_completed=tenant.onboarding_completed,
    )


# ─── 2C-8 Demo Veri ──────────────────────────────────────────────────────────

@router.post("/demo-data", status_code=200)
def load_demo_data(
    principal: Annotated[AuthPrincipal, Depends(require_permission("admin.users.write"))],
    db: Session = Depends(get_db),
) -> dict:
    """Tenant'a sektöre özel demo veri ekle."""
    tenant = _get_tenant_or_404(db, principal.tenant_id)
    seed_demo_data(db, tenant_id=principal.tenant_id, sector=tenant.sector)
    return {"ok": True, "message": "Demo data loaded."}


@router.delete("/demo-data", status_code=200)
def remove_demo_data(
    principal: Annotated[AuthPrincipal, Depends(require_permission("admin.users.write"))],
    db: Session = Depends(get_db),
) -> dict:
    """Tenant'ın tüm verilerini temizle (demo sıfırlama)."""
    clear_demo_data(db, tenant_id=principal.tenant_id)
    return {"ok": True, "message": "All data cleared."}


# ─── Şirket Profili (2B-11) ───────────────────────────────────────────────────

class CompanyProfileOut(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    tax_number: Optional[str] = None
    bank_info: Optional[str] = None
    logo_url: Optional[str] = None
    currency: str = "TRY"
    language: str = "tr"
    supported_currencies: list[str] = []
    supported_languages: list[str] = []

    model_config = {"from_attributes": True}


class CompanyProfileUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    tax_number: Optional[str] = None
    bank_info: Optional[str] = None
    logo_url: Optional[str] = None
    currency: Optional[str] = None
    language: Optional[str] = None

    @field_validator("currency")
    @classmethod
    def _validate_currency(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.upper()
        if v not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Desteklenmeyen para birimi: {v}")
        return v

    @field_validator("language")
    @classmethod
    def _validate_language(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.lower()
        if v not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Desteklenmeyen dil: {v}")
        return v


def _company_profile_out(tenant) -> CompanyProfileOut:
    out = CompanyProfileOut.model_validate(tenant)
    out.supported_currencies = sorted(SUPPORTED_CURRENCIES)
    out.supported_languages = sorted(SUPPORTED_LANGUAGES)
    return out


@router.get("/profile", response_model=CompanyProfileOut)
def get_company_profile(
    principal: Annotated[AuthPrincipal, Depends(get_current_principal)],
    db: Session = Depends(get_db),
) -> CompanyProfileOut:
    tenant = _get_tenant_or_404(db, principal.tenant_id)
    return _company_profile_out(tenant)


@router.patch("/profile", response_model=CompanyProfileOut)
def update_company_profile(
    body: CompanyProfileUpdate,
    principal: Annotated[AuthPrincipal, Depends(require_permission("admin.users.write"))],
    db: Session = Depends(get_db),
) -> CompanyProfileOut:
    tenant = _get_tenant_or_404(db, principal.tenant_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    db.commit()
    db.refresh(tenant)
    return _company_profile_out(tenant)


_LOGO_DIR = "static/logos"
_ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"}
_MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB


@router.post("/profile/logo")
async def upload_company_logo(
    file: UploadFile,
    principal: Annotated[AuthPrincipal, Depends(require_permission("admin.users.write"))],
    db: Session = Depends(get_db),
) -> dict:
    if file.content_type not in _ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload PNG, JPEG or WebP.")

    data = await file.read()
    if len(data) > _MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo size cannot exceed 2 MB.")

    ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower()
    filename = f"{principal.tenant_id}_{uuid.uuid4().hex[:8]}.{ext}"
    os.makedirs(_LOGO_DIR, exist_ok=True)
    dest = os.path.join(_LOGO_DIR, filename)
    with open(dest, "wb") as f:
        f.write(data)

    logo_url = f"/static/logos/{filename}"
    tenant = _get_tenant_or_404(db, principal.tenant_id)
    tenant.logo_url = logo_url
    db.commit()
    return {"logo_url": logo_url}
