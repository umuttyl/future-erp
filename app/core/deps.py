from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Annotated, Callable, Optional

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.exceptions import PermissionException, UnauthorizedException
from app.core.module_config import is_module_active
from app.core.permissions import user_permissions
from app.core.security import decode_access_token

if TYPE_CHECKING:
    from app.models.tenant import Tenant

security = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthPrincipal:
    user_id: int
    tenant_id: int          # 0 = platform admin sentinel
    email: str
    is_platform_admin: bool
    role_kind: str          # 'owner' | 'staff' | '' (platform admin için)

    @property
    def role(self) -> str:
        """Türetilmiş etiket. Tek kaynak: derive_role_label()."""
        from app.core.permissions import derive_role_label
        return derive_role_label(self.is_platform_admin, self.role_kind)


@dataclass(frozen=True)
class TenantContext:
    tenant_id: int


def get_current_principal(
    cred: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
) -> AuthPrincipal:
    if cred is None or not cred.credentials:
        raise UnauthorizedException("Oturum gerekli.", code="UNAUTHORIZED")
    token = cred.credentials.strip()
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        raise UnauthorizedException("Geçersiz veya süresi dolmuş oturum.", code="INVALID_TOKEN") from None
    if payload.get("typ") != "access":
        raise UnauthorizedException("Geçersiz token türü.", code="INVALID_TOKEN")
    try:
        uid = int(payload["sub"])
        tid = int(payload.get("tid") or 0)
    except (KeyError, TypeError, ValueError):
        raise UnauthorizedException("Geçersiz token içeriği.", code="INVALID_TOKEN") from None
    is_platform_admin = bool(payload.get("is_platform_admin", False))
    role_kind = str(payload.get("role_kind") or "")
    email = str(payload.get("email") or "")
    # tid=0 sadece platform admin için geçerlidir
    if tid == 0 and not is_platform_admin:
        raise UnauthorizedException("Geçersiz token içeriği.", code="INVALID_TOKEN")
    if not is_platform_admin and role_kind not in ("owner", "staff"):
        raise UnauthorizedException("Geçersiz rol.", code="INVALID_TOKEN")
    return AuthPrincipal(
        user_id=uid,
        tenant_id=tid,
        email=email,
        is_platform_admin=is_platform_admin,
        role_kind=role_kind,
    )


def get_tenant(
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(get_current_principal)],
    db: Session = Depends(get_db),
) -> "Tenant":
    from app.models.audit_log import AuditLog
    from app.models.tenant import Tenant as TenantModel

    tenant_id = principal.tenant_id
    if principal.is_platform_admin:
        hdr = request.headers.get("X-Impersonate-Tenant-Id")
        if hdr:
            try:
                tid_int = int(hdr)
                if tid_int > 0:
                    tenant_id = tid_int
                    db.add(AuditLog(
                        actor_tenant_id=None,       # platform admin — tenant yok
                        actor_user_id=principal.user_id,
                        action="admin.impersonate_tenant",
                        target_tenant_id=tid_int,
                        payload={"method": request.method, "path": request.url.path},
                        ip_address=request.client.host if request.client else None,
                    ))
                    db.commit()
            except (ValueError, TypeError):
                pass
        else:
            # Admin impersonation olmadan tenant endpoint'e erişemez
            from fastapi import HTTPException as _HTTPException
            raise _HTTPException(
                status_code=403,
                detail="Platform yöneticisi bir şirketi taklit etmeden şirkete ait endpoint'lere erişemez.",
            )

    # tenant_id hâlâ 0 ise (geçersiz/eksik impersonation header) → 403 (401 değil)
    if tenant_id == 0:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(
            status_code=403,
            detail="Geçersiz şirket kimliği. Platform yöneticisi geçerli bir X-Impersonate-Tenant-Id göndermeli.",
        )

    tenant = db.get(TenantModel, tenant_id)
    if tenant is None or not tenant.is_active:
        raise UnauthorizedException("Kiracı bulunamadı veya devre dışı.", code="TENANT_INACTIVE")
    return tenant


def get_tenant_ctx(
    tenant: Annotated["Tenant", Depends(get_tenant)],
) -> TenantContext:
    return TenantContext(tenant_id=tenant.id)


def require_permission(permission: str) -> Callable[..., AuthPrincipal]:
    def _check(
        principal: AuthPrincipal = Depends(get_current_principal),
        db: Session = Depends(get_db),
    ) -> AuthPrincipal:
        from sqlalchemy import select
        from sqlalchemy.orm import joinedload
        from app.models.user import User

        # platform admin → ALL_PERMISSIONS, DB round-trip gerekmez
        if principal.is_platform_admin:
            return principal

        user = db.scalar(
            select(User)
            .where(User.id == principal.user_id, User.tenant_id == principal.tenant_id)
            .options(joinedload(User.job_role))
        )
        if user is None or not user.is_active:
            raise UnauthorizedException("Hesap bulunamadı veya devre dışı.", code="UNAUTHORIZED")
        if permission not in user_permissions(user):
            raise PermissionException(code="PERMISSION_DENIED")
        return principal

    return _check


def require_module(module_key: str) -> Callable[..., AuthPrincipal]:
    """Dependency factory: İstenen modülün tenant için aktif olduğunu doğrular."""
    def _check(
        principal: AuthPrincipal = Depends(get_current_principal),
        tenant: "Tenant" = Depends(get_tenant),
    ) -> AuthPrincipal:
        if not is_module_active(tenant.active_modules, module_key):
            raise HTTPException(
                status_code=403,
                detail=f"'{module_key}' modülü şirketiniz için etkin değil.",
            )
        return principal

    return _check
