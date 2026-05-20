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
from app.core.permissions import role_has_permission
from app.core.security import decode_access_token

if TYPE_CHECKING:
    from app.models.tenant import Tenant

security = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthPrincipal:
    user_id: int
    tenant_id: int
    email: str
    role: str


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
        tid = int(payload["tid"])
    except (KeyError, TypeError, ValueError):
        raise UnauthorizedException("Geçersiz token içeriği.", code="INVALID_TOKEN") from None
    role = str(payload.get("role") or "")
    email = str(payload.get("email") or "")
    if role not in ("admin", "manager", "employee"):
        raise UnauthorizedException("Geçersiz rol.", code="INVALID_TOKEN")
    return AuthPrincipal(user_id=uid, tenant_id=tid, email=email, role=role)


def get_tenant(
    request: Request,
    principal: Annotated[AuthPrincipal, Depends(get_current_principal)],
    db: Session = Depends(get_db),
) -> "Tenant":
    from app.models.audit_log import AuditLog
    from app.models.tenant import Tenant as TenantModel

    tenant_id = principal.tenant_id
    if principal.role == "admin":
        hdr = request.headers.get("X-Impersonate-Tenant-Id")
        if hdr:
            try:
                tid_int = int(hdr)
                if tid_int > 0 and tid_int != principal.tenant_id:
                    tenant_id = tid_int
                    db.add(AuditLog(
                        actor_tenant_id=principal.tenant_id,
                        actor_user_id=principal.user_id,
                        action="admin.impersonate_tenant",
                        target_tenant_id=tid_int,
                        payload={"method": request.method, "path": request.url.path},
                    ))
                    db.commit()
            except (ValueError, TypeError):
                pass

    tenant = db.get(TenantModel, tenant_id)
    if tenant is None or not tenant.is_active:
        raise UnauthorizedException("Kiracı bulunamadı veya devre dışı.", code="TENANT_INACTIVE")
    return tenant


def get_tenant_ctx(
    tenant: Annotated["Tenant", Depends(get_tenant)],
) -> TenantContext:
    return TenantContext(tenant_id=tenant.id)


def require_permission(permission: str) -> Callable[..., AuthPrincipal]:
    def _check(principal: AuthPrincipal = Depends(get_current_principal)) -> AuthPrincipal:
        if not role_has_permission(principal.role, permission):
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
