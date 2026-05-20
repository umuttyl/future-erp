from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings

_ph = PasswordHasher()

# Kullanıcı bulunamadığında timing attack'ı önlemek için sabit hash (uygulama başlangıcında hesaplanır).
DUMMY_HASH: str = _ph.hash("__dummy_password_for_timing_protection__")


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        _ph.verify(password_hash, plain)
        return True
    except VerifyMismatchError:
        return False


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def new_refresh_token_value() -> str:
    return secrets.token_urlsafe(48)


def create_access_token(*, user_id: int, tenant_id: int, role: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JWT_ACCESS_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "tid": tenant_id,
        "role": role,
        "email": email,
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        options={"require": ["exp", "sub", "tid", "typ"]},
    )


def refresh_token_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS)


def decode_token_unverified_typ(token: str) -> Optional[str]:
    try:
        return str(jwt.decode(token, options={"verify_signature": False}).get("typ") or "")
    except Exception:
        return None
