from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_current_principal, get_tenant_ctx, require_permission
from app.core.exceptions import UnauthorizedException
from app.core.permissions import ADMIN_USERS_READ, ADMIN_USERS_WRITE, user_permissions
from app.models.user import User as UserModel
from app.schemas.auth import (
    AdminUserCreateIn,
    ChangePasswordIn,
    ForgotPasswordIn,
    ForgotPasswordOut,
    LoginIn,
    MeOut,
    MeUpdateIn,
    RefreshIn,
    RegisterIn,
    RegisterOut,
    ResetPasswordIn,
    ResetPasswordOut,
    SignupIn,
    TokenPairOut,
    UserOut,
    UserUpdateIn,
)
from app.core.rate_limit import limiter
from app.services.auth_service import auth_service

router = APIRouter()

_REFRESH_COOKIE = "future_erp_refresh"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.JWT_REFRESH_EXPIRE_DAYS * 86400,
        path="/api/auth",
    )


def _delete_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_REFRESH_COOKIE, path="/api/auth")


@router.post("/login", response_model=TokenPairOut)
@limiter.limit("10/minute")  # brute-force/credential-stuffing koruması (IP bazlı)
def login(request: Request, payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    _, access, refresh = auth_service.login(
        db,
        tenant_slug=payload.tenant_slug,
        email=str(payload.email),
        password=payload.password,
    )
    _set_refresh_cookie(response, refresh)
    return TokenPairOut(access_token=access, refresh_token=refresh)


@router.post("/platform-admin-login", response_model=TokenPairOut)
@limiter.limit("5/minute")
def platform_admin_login(request: Request, payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    """Platform yöneticisi girişi — tenant slug gerekmez, sadece email + şifre."""
    _, access, refresh = auth_service.platform_admin_login(
        db,
        email=str(payload.email),
        password=payload.password,
    )
    _set_refresh_cookie(response, refresh)
    return TokenPairOut(access_token=access, refresh_token=refresh)


@router.post("/register", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
def register(request: Request, payload: RegisterIn, response: Response, db: Session = Depends(get_db)):
    _, access, refresh, slug = auth_service.register_new_tenant(db, payload)
    _set_refresh_cookie(response, refresh)
    return RegisterOut(access_token=access, refresh_token=refresh, tenant_slug=slug)


@router.post("/signup", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
def signup(request: Request, payload: SignupIn, response: Response, db: Session = Depends(get_db)):
    """Yeni kiracı + ilk kullanıcı (HR alanları ile). ``/api/auth/signup``."""
    reg = RegisterIn(
        organization_name=payload.organization_name,
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name.strip(),
        department=payload.department,
    )
    _, access, refresh, slug = auth_service.register_new_tenant(db, reg)
    _set_refresh_cookie(response, refresh)
    return RegisterOut(access_token=access, refresh_token=refresh, tenant_slug=slug)


@router.post("/refresh", response_model=TokenPairOut)
@limiter.limit("10/minute")
def refresh_tokens(
    request: Request,
    response: Response,
    payload: Optional[RefreshIn] = None,
    db: Session = Depends(get_db),
):
    raw = request.cookies.get(_REFRESH_COOKIE) or (payload.refresh_token if payload else None)
    if not raw:
        raise UnauthorizedException("Refresh token yok.")
    _, access, refresh = auth_service.refresh(db, refresh_token=raw)
    _set_refresh_cookie(response, refresh)
    return TokenPairOut(access_token=access, refresh_token=refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    payload: Optional[RefreshIn] = None,
    db: Session = Depends(get_db),
):
    raw = request.cookies.get(_REFRESH_COOKIE) or (payload.refresh_token if payload else None)
    if raw:
        auth_service.logout(db, refresh_token=raw)
    _delete_refresh_cookie(response)
    return None


@router.post("/forgot-password", response_model=ForgotPasswordOut)
@limiter.limit("5/minute")
def forgot_password(request: Request, payload: ForgotPasswordIn, db: Session = Depends(get_db)):
    from app.core.config import settings
    from app.core.email import send_password_reset_email

    raw_token = auth_service.forgot_password(
        db,
        tenant_slug=payload.tenant_slug,
        email=str(payload.email),
    )
    if raw_token:
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        send_password_reset_email(
            to=str(payload.email),
            reset_url=reset_url,
            expires_minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES,
        )
    return ForgotPasswordOut()


@router.post("/reset-password", response_model=ResetPasswordOut)
@limiter.limit("10/minute")
def reset_password(request: Request, payload: ResetPasswordIn, db: Session = Depends(get_db)):
    auth_service.reset_password(db, token=payload.token, new_password=payload.new_password)
    return ResetPasswordOut()


@router.get("/me", response_model=MeOut)
def me(
    principal: AuthPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    from app.models.tenant import Tenant

    u = db.get(UserModel, principal.user_id)
    perms = sorted(user_permissions(u) if u else [])

    # Platform admin için tenant context yok — tenant bilgisi None döner
    tenant_id = None if principal.is_platform_admin else principal.tenant_id
    t = db.get(Tenant, tenant_id) if tenant_id else None

    return MeOut(
        id=principal.user_id,
        tenant_id=tenant_id,
        email=principal.email,
        is_platform_admin=principal.is_platform_admin,
        role_kind=principal.role_kind,
        permissions=perms,
        tenant_name=t.name if t else None,
        tenant_slug=t.slug if t else None,
        full_name=u.full_name if u else None,
        department=u.department if u else None,
        onboarding_completed=t.onboarding_completed if t else False,
        currency=getattr(t, "currency", "TRY") if t else "TRY",
        language=getattr(t, "language", "tr") if t else "tr",
    )


@router.patch("/me", response_model=MeOut)
def update_me(
    payload: MeUpdateIn,
    principal: AuthPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    from app.models.tenant import Tenant

    auth_service.update_me(db, user_id=principal.user_id, data=payload)
    u = db.get(UserModel, principal.user_id)
    perms = sorted(user_permissions(u) if u else [])
    tenant_id = None if principal.is_platform_admin else principal.tenant_id
    t = db.get(Tenant, tenant_id) if tenant_id else None
    return MeOut(
        id=principal.user_id,
        tenant_id=tenant_id,
        email=principal.email,
        is_platform_admin=principal.is_platform_admin,
        role_kind=principal.role_kind,
        permissions=perms,
        tenant_name=t.name if t else None,
        tenant_slug=t.slug if t else None,
        full_name=u.full_name if u else None,
        department=u.department if u else None,
        onboarding_completed=t.onboarding_completed if t else False,
        currency=getattr(t, "currency", "TRY") if t else "TRY",
        language=getattr(t, "language", "tr") if t else "tr",
    )


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_own_password(
    payload: ChangePasswordIn,
    principal: AuthPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    auth_service.change_own_password(
        db,
        user_id=principal.user_id,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    return None


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


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdateIn,
    _: AuthPrincipal = Depends(require_permission(ADMIN_USERS_WRITE)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return auth_service.update_user(db, tenant_id=ctx.tenant_id, user_id=user_id, data=payload)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    _: AuthPrincipal = Depends(require_permission(ADMIN_USERS_WRITE)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    auth_service.delete_user(db, tenant_id=ctx.tenant_id, user_id=user_id)
    return None
