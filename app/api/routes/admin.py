"""Platform admin endpoint'leri — tüm tenant'ları yönetmek için.

Sadece role='admin' kullanıcıları erişebilir.
"""
from __future__ import annotations

import csv
import io
import time as _time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, get_current_principal
from app.core.module_config import validate_modules
from app.core.security import hash_password, verify_password
from app.models.audit_log import AuditLog
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter()

_APP_START_TIME = _time.time()


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
    total_users: int        # role='admin' hariç gerçek müşteri kullanıcıları
    onboarded_tenants: int


class AdminProfileOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    model_config = {"from_attributes": True}


class AdminProfileUpdateIn(BaseModel):
    full_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class HealthStats(BaseModel):
    status: str
    uptime_seconds: float
    db_ok: bool
    tenant_count: int
    user_count: int
    sales_record_count: int
    product_count: int


class CrossTenantUserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    role_kind: Optional[str] = None
    is_active: bool
    tenant_id: Optional[int] = None
    tenant_name: Optional[str] = None
    department: Optional[str] = None
    model_config = {"from_attributes": True}


class AdminUserPasswordResetIn(BaseModel):
    new_password: str


class AdminUserStatusIn(BaseModel):
    is_active: bool


def _require_admin(principal: AuthPrincipal = Depends(get_current_principal)) -> AuthPrincipal:
    """Yalnızca platform admin (is_platform_admin=True) erişebilir.

    DİKKAT: `ADMIN_ACCESS` izni yeterli DEĞİL — tenant owner'lar da ALL_PERMISSIONS'a
    (dolayısıyla ADMIN_ACCESS'e) sahip. Platform uçları yalnızca gerçek platform
    operatörüne açık olmalı; aksi halde owner cross-tenant veriye erişir.
    """
    if not principal.is_platform_admin:
        raise HTTPException(status_code=403, detail="Platform administrator permission required.")
    return principal


# ---------------------------------------------------------------------------
# ADM-1 — Admin kendi profilini yönetir
# ---------------------------------------------------------------------------

@router.get("/me", response_model=AdminProfileOut)
def admin_get_me(
    principal: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, principal.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.patch("/me", response_model=AdminProfileOut)
def admin_update_me(
    data: AdminProfileUpdateIn,
    principal: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(User, principal.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if data.full_name is not None:
        user.full_name = data.full_name.strip() or None

    if data.new_password:
        if not data.current_password:
            raise HTTPException(status_code=400, detail="Current password required.")
        if not verify_password(data.current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        if len(data.new_password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
        user.password_hash = hash_password(data.new_password)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# ADM-2 — Sistem sağlığı
# ---------------------------------------------------------------------------

@router.get("/health", response_model=HealthStats)
def admin_health(
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    from app.models.product import Product
    from app.models.sales import SalesRecord
    try:
        tenant_count  = db.scalar(select(func.count()).select_from(Tenant)) or 0
        user_count    = db.scalar(
            select(func.count()).select_from(User).where(User.is_platform_admin.is_(False))
        ) or 0
        sales_count   = db.scalar(select(func.count()).select_from(SalesRecord)) or 0
        product_count = db.scalar(select(func.count()).select_from(Product)) or 0
        db_ok = True
    except Exception:
        db_ok = False
        tenant_count = user_count = sales_count = product_count = 0

    return HealthStats(
        status="ok" if db_ok else "degraded",
        uptime_seconds=round(_time.time() - _APP_START_TIME, 1),
        db_ok=db_ok,
        tenant_count=tenant_count,
        user_count=user_count,
        sales_record_count=sales_count,
        product_count=product_count,
    )


# ---------------------------------------------------------------------------
# ADM-3 — Cross-tenant kullanıcı listesi
# ---------------------------------------------------------------------------

@router.get("/users", response_model=List[CrossTenantUserOut])
def list_all_users(
    tenant_id: Optional[int] = None,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    stmt = (
        select(User, Tenant.name.label("tenant_name"))
        .join(Tenant, Tenant.id == User.tenant_id)
        .where(User.is_platform_admin.is_(False))
        .order_by(User.tenant_id.asc(), User.id.asc())
        .offset(skip)
        .limit(limit)
    )
    if tenant_id is not None:
        stmt = stmt.where(User.tenant_id == tenant_id)
    if q:
        stmt = stmt.where(
            (User.email.ilike(f"%{q}%")) | (User.full_name.ilike(f"%{q}%"))
        )
    rows = db.execute(stmt).all()
    return [
        CrossTenantUserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            role_kind=u.role_kind,
            is_active=u.is_active,
            tenant_id=u.tenant_id,
            tenant_name=tenant_name,
            department=u.department,
        )
        for u, tenant_name in rows
    ]


# ---------------------------------------------------------------------------
# B — Admin tenant kullanıcı yönetimi (şifre sıfırlama + askıya alma)
# ---------------------------------------------------------------------------

def _get_managed_tenant_user(db: Session, user_id: int) -> User:
    """Admin'in yönetebileceği tenant kullanıcısını döner.

    Güvenlik: admin başka bir platform admin'i (kendisi dahil) bu uçlardan
    değiştiremez — yalnızca tenant kullanıcıları yönetilir.
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.is_platform_admin:
        raise HTTPException(
            status_code=403,
            detail="Platform administrator accounts cannot be managed from this endpoint.",
        )
    return user


@router.patch("/users/{user_id}/password", status_code=200)
def admin_reset_user_password(
    user_id: int,
    data: AdminUserPasswordResetIn,
    principal: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Admin bir tenant kullanıcısının şifresini sıfırlar (destek: 'şifremi unuttum')."""
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    user = _get_managed_tenant_user(db, user_id)
    user.password_hash = hash_password(data.new_password)
    db.add(user)
    db.add(AuditLog(
        actor_tenant_id=None,
        actor_user_id=principal.user_id,
        action="admin.user_password_reset",
        target_tenant_id=user.tenant_id,
        target_entity_type="user",
        target_entity_id=user.id,
        payload={"by": "platform_admin"},
    ))
    db.commit()
    return {"ok": True, "message": "Password reset."}


@router.patch("/users/{user_id}/status", response_model=CrossTenantUserOut)
def admin_set_user_status(
    user_id: int,
    data: AdminUserStatusIn,
    principal: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    """Admin bir tenant kullanıcısını askıya alır / yeniden aktifleştirir."""
    user = _get_managed_tenant_user(db, user_id)
    user.is_active = data.is_active
    db.add(user)
    db.add(AuditLog(
        actor_tenant_id=None,
        actor_user_id=principal.user_id,
        action="admin.user_status_change",
        target_tenant_id=user.tenant_id,
        target_entity_type="user",
        target_entity_id=user.id,
        payload={"is_active": data.is_active},
    ))
    db.commit()
    db.refresh(user)
    tenant = db.get(Tenant, user.tenant_id) if user.tenant_id else None
    return CrossTenantUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        role_kind=user.role_kind,
        is_active=user.is_active,
        tenant_id=user.tenant_id,
        tenant_name=tenant.name if tenant else None,
        department=user.department,
    )


# ---------------------------------------------------------------------------
# ADM-4 — Platform istatistikleri (admin hariç user sayısı)
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=PlatformStats)
def platform_stats(
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    total_tenants  = db.scalar(select(func.count()).select_from(Tenant)) or 0
    active_tenants = db.scalar(select(func.count()).select_from(Tenant).where(Tenant.is_active.is_(True))) or 0
    total_users    = db.scalar(
        select(func.count()).select_from(User).where(User.is_platform_admin.is_(False))
    ) or 0
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
        raise HTTPException(status_code=404, detail="Company not found.")
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
    principal: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Company not found.")
    if payload.is_active is not None and payload.is_active != tenant.is_active:
        tenant.is_active = payload.is_active
        action = "tenant.activated" if payload.is_active else "tenant.deactivated"
        db.add(AuditLog(
            actor_tenant_id=None,
            actor_user_id=principal.user_id,
            action=action,
            target_tenant_id=tenant_id,
            target_entity_type="tenant",
            target_entity_id=tenant_id,
            payload={"name": tenant.name, "slug": tenant.slug},
        ))
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
        raise HTTPException(status_code=404, detail="Company not found.")
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


class AuditLogOut(BaseModel):
    id: int
    actor_tenant_id: Optional[int] = None
    actor_user_id: int
    action: str
    target_tenant_id: Optional[int] = None
    target_entity_type: Optional[str] = None
    target_entity_id: Optional[int] = None
    payload: Optional[dict] = None
    ip_address: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/audit-logs", response_model=List[AuditLogOut])
def list_audit_logs(
    tenant_id: Optional[int] = None,
    action: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    stmt = (
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if tenant_id is not None:
        stmt = stmt.where(AuditLog.actor_tenant_id == tenant_id)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    return list(db.scalars(stmt).all())


@router.get("/audit-logs/export")
def export_audit_logs(
    tenant_id: Optional[int] = None,
    action: Optional[str] = None,
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    """Download all matching audit logs as a CSV file."""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(5000)
    if tenant_id is not None:
        stmt = stmt.where(AuditLog.actor_tenant_id == tenant_id)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    rows = list(db.scalars(stmt).all())

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at", "action", "actor_user_id", "actor_tenant_id",
                     "target_tenant_id", "target_entity_type", "target_entity_id",
                     "ip_address", "payload"])
    for r in rows:
        writer.writerow([
            r.id,
            r.created_at.isoformat() if r.created_at else "",
            r.action,
            r.actor_user_id,
            r.actor_tenant_id if r.actor_tenant_id is not None else "",
            r.target_tenant_id if r.target_tenant_id is not None else "",
            r.target_entity_type or "",
            r.target_entity_id if r.target_entity_id is not None else "",
            r.ip_address or "",
            r.payload or "",
        ])
    csv_bytes = buf.getvalue().encode("utf-8-sig")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )


class PlatformOverviewOut(BaseModel):
    total_revenue_30d: float
    total_orders_30d: int
    active_tenants: int
    total_tenants: int
    churn_risk_count: int
    churn_risk_tenants: List[Dict[str, Any]]
    module_adoption: Dict[str, Any]


@router.get("/platform-overview", response_model=PlatformOverviewOut)
def platform_overview(
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    """Aggregate platform stats: revenue, orders, module adoption, churn risk."""
    from app.models.sales import SalesRecord
    from app.services.finance_service import finance_service as _fin

    today = date.today()
    last_30 = today - timedelta(days=30)

    all_tenants = list(db.scalars(select(Tenant)).all())
    active_tenants = [t for t in all_tenants if t.is_active]

    total_revenue = 0.0
    total_orders = 0
    churn_risk: List[Dict[str, Any]] = []

    for t in active_tenants:
        summary = _fin.summary(db, t.id, start_date=last_30, end_date=today)
        rev = float(summary.get("revenue") or 0)
        total_revenue += rev
        total_orders += int(summary.get("order_count") or 0)
        if rev == 0:
            last_sale = db.scalar(
                select(func.max(SalesRecord.sale_date)).where(SalesRecord.tenant_id == t.id)
            )
            churn_risk.append({
                "id": t.id,
                "name": t.name or t.slug,
                "last_sale_date": str(last_sale) if last_sale else None,
            })

    module_keys = ["sales", "stock", "hr", "finance", "orders", "suppliers", "cashbook"]
    n_active = len(active_tenants)
    module_adoption: Dict[str, Any] = {
        key: {
            "active": sum(1 for t in active_tenants if key in (t.active_modules or [])),
            "total": n_active,
        }
        for key in module_keys
    }

    return PlatformOverviewOut(
        total_revenue_30d=round(total_revenue, 2),
        total_orders_30d=total_orders,
        active_tenants=n_active,
        total_tenants=len(all_tenants),
        churn_risk_count=len(churn_risk),
        churn_risk_tenants=churn_risk,
        module_adoption=module_adoption,
    )


@router.get("/ai-overview")
def platform_ai_overview(
    force: bool = False,
    _: AuthPrincipal = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Platform-wide AI insights (aggregate, no individual company data)."""
    from app.services.ai_insights import build_platform_insights
    return build_platform_insights(db, language="en", force_refresh=force)
