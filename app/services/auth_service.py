from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, UnauthorizedException
from app.core.permissions import ROLE_ADMIN, ROLE_MANAGER, role_permissions
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token_value,
    refresh_token_expires_at,
    verify_password,
)
from app.models.tenant import Tenant
from app.models.user import RefreshToken, User
from app.schemas.auth import AdminUserCreateIn, RegisterIn, UserUpdateIn


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")[:60]
    return s or "org"


class AuthService:
    def get_user_by_id(self, db: Session, user_id: int) -> Optional[User]:
        return db.get(User, user_id)

    def get_user_by_email(self, db: Session, *, tenant_id: int, email: str) -> Optional[User]:
        stmt = select(User).where(User.tenant_id == tenant_id, User.email == email.lower())
        return db.scalar(stmt)

    def register_new_tenant(self, db: Session, data: RegisterIn) -> tuple[User, str, str, str]:
        slug_base = _slugify(data.organization_name)
        slug = slug_base
        n = 1
        while db.scalar(select(Tenant.id).where(Tenant.slug == slug)):
            n += 1
            slug = f"{slug_base}-{n}"

        tenant = Tenant(name=data.organization_name.strip(), slug=slug)
        db.add(tenant)
        db.flush()

        if self.get_user_by_email(db, tenant_id=tenant.id, email=str(data.email)):
            raise ConflictException("Bu e-posta zaten kayıtlı.", code="EMAIL_EXISTS")

        fn = (data.full_name or "").strip() or None
        dep = (data.department or "").strip() or None
        user = User(
            tenant_id=tenant.id,
            email=str(data.email).lower(),
            password_hash=hash_password(data.password),
            full_name=fn,
            department=dep,
            role=ROLE_MANAGER,  # Yeni kayıt = şirket sahibi (manager). Admin=platform superuser.
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        access, raw_refresh = self._issue_tokens(db, user)
        return user, access, raw_refresh, slug

    def login(self, db: Session, *, tenant_slug: str, email: str, password: str) -> tuple[User, str, str]:
        tid = db.scalar(select(Tenant.id).where(Tenant.slug == tenant_slug.strip().lower()))
        if tid is None:
            raise UnauthorizedException("Şirket bulunamadı.", code="TENANT_NOT_FOUND")
        stmt = (
            select(User)
            .where(
                User.tenant_id == tid,
                User.email == email.lower(),
                User.is_active.is_(True),
            )
        )
        user = db.scalar(stmt)
        # Kullanıcı bulunamazsa yine hash doğrulaması yap; yanıt süresi eşit kalır (user enumeration önlemi).
        candidate_hash = user.password_hash if user else DUMMY_HASH
        if not user or not verify_password(password, candidate_hash):
            raise UnauthorizedException("E-posta veya şifre hatalı.", code="INVALID_CREDENTIALS")
        access, raw_refresh = self._issue_tokens(db, user)
        return user, access, raw_refresh

    def _issue_tokens(self, db: Session, user: User) -> tuple[str, str]:
        access = create_access_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            role=user.role,
            email=user.email,
        )
        raw = new_refresh_token_value()
        rt = RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw),
            expires_at=refresh_token_expires_at(),
        )
        db.add(rt)
        db.commit()
        return access, raw

    def refresh(self, db: Session, *, refresh_token: str) -> tuple[User, str, str]:
        th = hash_refresh_token(refresh_token)
        stmt = select(RefreshToken).where(
            RefreshToken.token_hash == th,
            RefreshToken.revoked_at.is_(None),
        )
        row = db.scalar(stmt)
        if not row:
            raise UnauthorizedException("Geçersiz yenileme anahtarı.", code="INVALID_REFRESH")
        # Replay attack önlemi: aynı token ikinci kez kullanılamaz.
        if row.used_at is not None:
            row.revoked_at = datetime.now(timezone.utc)
            db.add(row)
            db.commit()
            raise UnauthorizedException("Yenileme anahtarı zaten kullanıldı.", code="INVALID_REFRESH")
        user = self.get_user_by_id(db, row.user_id)
        if not user or not user.is_active:
            raise UnauthorizedException("Hesap kullanılamıyor.", code="INVALID_REFRESH")
        now = datetime.now(timezone.utc)
        row.used_at = now
        row.revoked_at = now
        db.add(row)
        db.commit()
        access, new_raw = self._issue_tokens(db, user)
        return user, access, new_raw

    def logout(self, db: Session, *, refresh_token: str) -> None:
        th = hash_refresh_token(refresh_token)
        row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == th))
        if row and row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
            db.add(row)
            db.commit()

    def list_users(self, db: Session, *, tenant_id: int) -> List[User]:
        stmt = select(User).where(User.tenant_id == tenant_id).order_by(User.id.asc())
        return list(db.scalars(stmt).all())

    def create_user_admin(
        self,
        db: Session,
        *,
        tenant_id: int,
        data: AdminUserCreateIn,
    ) -> User:
        if self.get_user_by_email(db, tenant_id=tenant_id, email=str(data.email)):
            raise ConflictException("Bu e-posta zaten kayıtlı.", code="EMAIL_EXISTS")
        fn = (data.full_name or "").strip() or None
        dep = (data.department or "").strip() or None
        u = User(
            tenant_id=tenant_id,
            email=str(data.email).lower(),
            password_hash=hash_password(data.password),
            full_name=fn,
            department=dep,
            role=data.role,
            is_active=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        return u


    def update_user(
        self,
        db: Session,
        *,
        tenant_id: int,
        user_id: int,
        data: UserUpdateIn,
    ) -> User:
        from app.core.exceptions import NotFoundException

        user = db.scalar(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
        if not user:
            raise NotFoundException("Kullanıcı bulunamadı.", code="USER_NOT_FOUND")
        if data.role is not None:
            user.role = data.role
        if data.full_name is not None:
            user.full_name = data.full_name.strip() or None
        if data.department is not None:
            user.department = data.department.strip() or None
        if data.is_active is not None:
            user.is_active = data.is_active
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def delete_user(self, db: Session, *, tenant_id: int, user_id: int) -> None:
        from app.core.exceptions import NotFoundException

        user = db.scalar(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
        if not user:
            raise NotFoundException("Kullanıcı bulunamadı.", code="USER_NOT_FOUND")
        db.delete(user)
        db.commit()


auth_service = AuthService()
