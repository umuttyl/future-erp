"""Tenant-scoped role (JobRoleTemplate) CRUD."""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import ConflictException, NotFoundException
from app.core.permissions import ADMIN_USERS_READ, ADMIN_USERS_WRITE
from app.models.job_role_template import JobRoleTemplate
from app.schemas.roles import RoleCreate, RoleOut, RoleUpdate
from app.services.job_role_seed import seed_system_roles

router = APIRouter()


def _get_role_or_404(db: Session, tenant_id: int, role_id: int) -> JobRoleTemplate:
    role = db.scalar(
        select(JobRoleTemplate).where(
            JobRoleTemplate.id == role_id,
            JobRoleTemplate.tenant_id == tenant_id,
        )
    )
    if role is None:
        raise NotFoundException("Role not found.", code="ROLE_NOT_FOUND")
    return role


@router.get("", response_model=list[RoleOut])
def list_roles(
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: AuthPrincipal = Depends(require_permission(ADMIN_USERS_READ)),
    db: Session = Depends(get_db),
):
    # Sistem rollerini her seferinde senkronize et (eksik ekler, izinleri günceller)
    seed_system_roles(db, ctx.tenant_id)
    db.commit()
    rows = db.scalars(
        select(JobRoleTemplate)
        .where(JobRoleTemplate.tenant_id == ctx.tenant_id)
        .order_by(JobRoleTemplate.is_system.desc(), JobRoleTemplate.name)
    ).all()
    return list(rows)


@router.post("", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: AuthPrincipal = Depends(require_permission(ADMIN_USERS_WRITE)),
    db: Session = Depends(get_db),
):
    existing = db.scalar(
        select(JobRoleTemplate).where(
            JobRoleTemplate.tenant_id == ctx.tenant_id,
            JobRoleTemplate.name == payload.name,
        )
    )
    if existing:
        raise ConflictException("Bu isimde bir rol zaten var.", code="ROLE_NAME_EXISTS")

    role = JobRoleTemplate(
        tenant_id=ctx.tenant_id,
        name=payload.name,
        permissions=list(dict.fromkeys(payload.permissions)),  # deduplicate, preserve order
        is_system=False,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.patch("/{role_id}", response_model=RoleOut)
def update_role(
    role_id: int,
    payload: RoleUpdate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: AuthPrincipal = Depends(require_permission(ADMIN_USERS_WRITE)),
    db: Session = Depends(get_db),
):
    role = _get_role_or_404(db, ctx.tenant_id, role_id)

    if payload.name is not None and payload.name != role.name:
        clash = db.scalar(
            select(JobRoleTemplate).where(
                JobRoleTemplate.tenant_id == ctx.tenant_id,
                JobRoleTemplate.name == payload.name,
                JobRoleTemplate.id != role_id,
            )
        )
        if clash:
            raise ConflictException("Bu isimde bir rol zaten var.", code="ROLE_NAME_EXISTS")
        role.name = payload.name

    if payload.permissions is not None:
        role.permissions = list(dict.fromkeys(payload.permissions))

    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: AuthPrincipal = Depends(require_permission(ADMIN_USERS_WRITE)),
    db: Session = Depends(get_db),
):
    role = _get_role_or_404(db, ctx.tenant_id, role_id)
    if role.is_system:
        raise ConflictException("Sistem rolleri silinemez.", code="SYSTEM_ROLE_PROTECTED")
    db.delete(role)
    db.commit()
