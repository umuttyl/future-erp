"""Onboarding endpoint'leri.

Manager kayıt sonrası sektör + modül seçimi yapar.
Ayarlar sayfasından modüller güncellenebilir.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, get_current_principal, require_permission
from app.core.exceptions import AppException, NotFoundException
from app.core.permissions import ADMIN_ACCESS
from app.models.tenant import Tenant
from app.schemas.onboarding import (
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
        raise NotFoundException("Şirket bulunamadı.")
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
