"""Platform admin endpoint'leri — tüm tenant'ları yönetmek için.

Sadece role='admin' kullanıcıları erişebilir.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, require_permission
from app.core.module_config import validate_modules
from app.core.permissions import ADMIN_ACCESS
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter()


class TenantOut(BaseModel):
    id: int
    name: str
    slug: str
    is_active: bool
    sector: Optional[str] = None
    active_modules: List[str] = []
    onboarding_completed: bool
    user_count: int = 0

    model_config = {"from_attributes": True}


class TenantUpdateIn(BaseModel):
    is_active: Optional[bool] = None
    active_modules: Optional[List[str]] = None


class PlatformStats(BaseModel):
    total_tenants: int
    active_tenants: int
    total_users: int
    onboarded_tenants: int


def _require_admin(principal: AuthPrincipal = Depends(require_permission(ADMIN_ACCESS))) -> AuthPrincipal:
    return principal


@router.get("/stats", response_model=PlatformStats)
def platform_stats(
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    total_tenants = db.scalar(select(func.count()).select_from(Tenant)) or 0
    active_tenants = db.scalar(select(func.count()).select_from(Tenant).where(Tenant.is_active.is_(True))) or 0
    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    onboarded = db.scalar(
        select(func.count()).select_from(Tenant).where(Tenant.onboarding_completed.is_(True))
    ) or 0
    return PlatformStats(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        total_users=total_users,
        onboarded_tenants=onboarded,
    )


@router.get("/tenants", response_model=List[TenantOut])
def list_tenants(
    skip: int = 0,
    limit: int = 100,
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    tenants = db.scalars(select(Tenant).offset(skip).limit(limit)).all()
    result: list[TenantOut] = []
    for t in tenants:
        user_count = db.scalar(select(func.count()).select_from(User).where(User.tenant_id == t.id)) or 0
        result.append(
            TenantOut(
                id=t.id,
                name=t.name,
                slug=t.slug,
                is_active=t.is_active,
                sector=t.sector,
                active_modules=t.active_modules,
                onboarding_completed=t.onboarding_completed,
                user_count=user_count,
            )
        )
    return result


@router.get("/tenants/{tenant_id}", response_model=TenantOut)
def get_tenant_detail(
    tenant_id: int,
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı.")
    user_count = db.scalar(select(func.count()).select_from(User).where(User.tenant_id == tenant.id)) or 0
    return TenantOut(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        sector=tenant.sector,
        active_modules=tenant.active_modules,
        onboarding_completed=tenant.onboarding_completed,
        user_count=user_count,
    )


@router.patch("/tenants/{tenant_id}", response_model=TenantOut)
def update_tenant(
    tenant_id: int,
    payload: TenantUpdateIn,
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı.")
    if payload.is_active is not None:
        tenant.is_active = payload.is_active
    if payload.active_modules is not None:
        tenant.active_modules = validate_modules(payload.active_modules)
    db.commit()
    db.refresh(tenant)
    user_count = db.scalar(select(func.count()).select_from(User).where(User.tenant_id == tenant.id)) or 0
    return TenantOut(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        sector=tenant.sector,
        active_modules=tenant.active_modules,
        onboarding_completed=tenant.onboarding_completed,
        user_count=user_count,
    )


@router.get("/tenants/{tenant_id}/users")
def get_tenant_users(
    tenant_id: int,
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı.")
    users = db.scalars(select(User).where(User.tenant_id == tenant_id)).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "role": u.role,
            "full_name": u.full_name,
            "department": u.department,
            "is_active": u.is_active,
        }
        for u in users
    ]
