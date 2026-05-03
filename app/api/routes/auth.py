from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_current_principal, get_tenant_ctx, require_permission
from app.core.permissions import ADMIN_USERS_READ, ADMIN_USERS_WRITE, role_permissions
from app.models.user import User as UserModel
from app.schemas.auth import (
    AdminUserCreateIn,
    LoginIn,
    MeOut,
    RefreshIn,
    RegisterIn,
    RegisterOut,
    SignupIn,
    TokenPairOut,
    UserOut,
)
from app.services.auth_service import auth_service

router = APIRouter()


@router.post("/login", response_model=TokenPairOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    _, access, refresh = auth_service.login(
        db,
        tenant_slug=payload.tenant_slug,
        email=str(payload.email),
        password=payload.password,
    )
    return TokenPairOut(access_token=access, refresh_token=refresh)


@router.post("/register", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    _, access, refresh, slug = auth_service.register_new_tenant(db, payload)
    return RegisterOut(access_token=access, refresh_token=refresh, tenant_slug=slug)


@router.post("/signup", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupIn, db: Session = Depends(get_db)):
    """Yeni kiracı + ilk kullanıcı (HR alanları ile). ``/api/auth/signup``."""
    reg = RegisterIn(
        organization_name=payload.organization_name,
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name.strip(),
        department=payload.department,
    )
    _, access, refresh, slug = auth_service.register_new_tenant(db, reg)
    return RegisterOut(access_token=access, refresh_token=refresh, tenant_slug=slug)


@router.post("/refresh", response_model=TokenPairOut)
def refresh_tokens(payload: RefreshIn, db: Session = Depends(get_db)):
    _, access, refresh = auth_service.refresh(db, refresh_token=payload.refresh_token)
    return TokenPairOut(access_token=access, refresh_token=refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshIn, db: Session = Depends(get_db)):
    auth_service.logout(db, refresh_token=payload.refresh_token)
    return None


@router.get("/me", response_model=MeOut)
def me(
    principal: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    from app.models.tenant import Tenant

    t = db.get(Tenant, ctx.tenant_id)
    u = db.get(UserModel, principal.user_id)
    perms = sorted(role_permissions(principal.role))
    return MeOut(
        id=principal.user_id,
        tenant_id=principal.tenant_id,
        email=principal.email,
        role=principal.role,
        permissions=perms,
        tenant_name=t.name if t else None,
        full_name=u.full_name if u else None,
        department=u.department if u else None,
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    _: AuthPrincipal = Depends(require_permission(ADMIN_USERS_READ)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return auth_service.list_users(db, tenant_id=ctx.tenant_id)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreateIn,
    _: AuthPrincipal = Depends(require_permission(ADMIN_USERS_WRITE)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return auth_service.create_user_admin(db, tenant_id=ctx.tenant_id, data=payload)
