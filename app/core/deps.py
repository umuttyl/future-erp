from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Callable

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import PermissionException, UnauthorizedException
from app.core.permissions import role_has_permission
from app.core.security import decode_access_token

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
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
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


def get_tenant_ctx(principal: Annotated[AuthPrincipal, Depends(get_current_principal)]) -> TenantContext:
    return TenantContext(tenant_id=principal.tenant_id)


def require_permission(permission: str) -> Callable[..., AuthPrincipal]:
    def _check(principal: AuthPrincipal = Depends(get_current_principal)) -> AuthPrincipal:
        if not role_has_permission(principal.role, permission):
            raise PermissionException(code="PERMISSION_DENIED")
        return principal

    return _check
