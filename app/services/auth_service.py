from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ConflictException, UnauthorizedException
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token_value,
    refresh_token_expires_at,
    verify_password,
)
from app.models.password_reset_token import PasswordResetToken
from app.models.tenant import Tenant
from app.models.user import RefreshToken, User
from app.schemas.auth import AdminUserCreateIn, MeUpdateIn, RegisterIn, UserUpdateIn
from app.services.job_role_seed import seed_system_roles


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

        seed_system_roles(db, tenant.id)

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
            is_platform_admin=False,
            role_kind="owner",   # Yeni kayıt = şirket sahibi
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        access, raw_refresh = self._issue_tokens(db, user)
        return user, access, raw_refresh, slug

    def login(self, db: Session, *, tenant_slug: str, email: str, password: str) -> tuple[User, str, str]:
        # Şirket kodu boş → platform admin otomatik algılama
        if not tenant_slug or not tenant_slug.strip():
            return self.platform_admin_login(db, email=email, password=password)

        raw = tenant_slug.strip()
        # 1) exact slug match (lowercase)
        tid = db.scalar(select(Tenant.id).where(Tenant.slug == raw.lower()))
        # 2) case-insensitive name match (user typed company name instead of slug)
        if tid is None:
            tid = db.scalar(
                select(Tenant.id).where(func.lower(Tenant.name) == raw.lower())
            )
        if tid is None:
            raise UnauthorizedException("Company not found. Check the name and try again.", code="TENANT_NOT_FOUND")
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
            raise UnauthorizedException("Invalid email or password.", code="INVALID_CREDENTIALS")
        access, raw_refresh = self._issue_tokens(db, user)
        return user, access, raw_refresh

    def platform_admin_login(self, db: Session, *, email: str, password: str) -> tuple[User, str, str]:
        """Tenant slug gerektirmeyen platform admin girişi.

        Yalnızca is_platform_admin=True AND tenant_id IS NULL kullanıcılar için geçerlidir.
        """
        stmt = select(User).where(
            User.email == email.lower(),
            User.is_platform_admin.is_(True),
            User.tenant_id.is_(None),
            User.is_active.is_(True),
        )
        user = db.scalar(stmt)
        candidate_hash = user.password_hash if user else DUMMY_HASH
        if not user or not verify_password(password, candidate_hash):
            raise UnauthorizedException("Invalid email or password.", code="INVALID_CREDENTIALS")
        access, raw_refresh = self._issue_tokens(db, user)
        return user, access, raw_refresh

    def _issue_tokens(self, db: Session, user: User) -> tuple[str, str]:
        access = create_access_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            is_platform_admin=user.is_platform_admin,
            role_kind=user.role_kind if not user.is_platform_admin else "",
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
        stmt = (
            select(User)
            .where(User.tenant_id == tenant_id)
            .where(User.is_platform_admin.is_(False))   # platform admin listede görünmemeli
            .order_by(User.id.asc())
        )
        return list(db.scalars(stmt).all())

    def _validate_job_role(self, db: Session, *, tenant_id: int, job_role_id: Optional[int]) -> int:
        """Staff için job_role zorunlu + tenant'a ait olmalı. Geçerli id döner."""
        from app.core.exceptions import ValidationException
        from app.models.job_role_template import JobRoleTemplate

        if job_role_id is None:
            raise ValidationException(
                "Çalışan için bir rol şablonu (job_role) seçilmelidir.",
                code="JOB_ROLE_REQUIRED",
            )
        role = db.scalar(
            select(JobRoleTemplate).where(
                JobRoleTemplate.id == job_role_id,
                JobRoleTemplate.tenant_id == tenant_id,
            )
        )
        if role is None:
            raise ValidationException(
                "Seçilen rol şablonu bu şirkete ait değil.",
                code="JOB_ROLE_INVALID",
            )
        return job_role_id

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
        role_kind = data.role_kind or ("owner" if data.role == "manager" else "staff")

        # Staff için job_role zorunlu + tenant doğrulaması (izinsiz/boş ekran bug'ını önler)
        job_role_id: Optional[int] = None
        if role_kind == "staff":
            job_role_id = self._validate_job_role(db, tenant_id=tenant_id, job_role_id=data.job_role_id)

        u = User(
            tenant_id=tenant_id,
            email=str(data.email).lower(),
            password_hash=hash_password(data.password),
            full_name=fn,
            department=dep,
            is_platform_admin=False,
            role_kind=role_kind,
            job_role_id=job_role_id,
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
            # role string → role_kind dönüşümü (geriye uyumluluk)
            if data.role_kind is None:
                user.role_kind = "owner" if data.role == "manager" else "staff"
        if data.role_kind is not None:
            user.role_kind = data.role_kind
        if data.job_role_id is not None:
            user.job_role_id = data.job_role_id
        elif data.role_kind == "owner":
            user.job_role_id = None  # owner için rol şablonu gerekmez

        # Son durumda staff ise job_role zorunlu + tenant doğrulaması
        if user.role_kind == "staff":
            user.job_role_id = self._validate_job_role(
                db, tenant_id=tenant_id, job_role_id=user.job_role_id
            )
        elif user.role_kind == "owner":
            user.job_role_id = None

        if data.full_name is not None:
            user.full_name = data.full_name.strip() or None
        if data.department is not None:
            user.department = data.department.strip() or None
        if data.is_active is not None:
            user.is_active = data.is_active
        if data.new_password is not None:
            user.password_hash = hash_password(data.new_password)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def update_me(self, db: Session, *, user_id: int, data: MeUpdateIn) -> User:
        from app.core.exceptions import NotFoundException

        user = self.get_user_by_id(db, user_id)
        if not user:
            raise NotFoundException("User not found.", code="USER_NOT_FOUND")
        if data.full_name is not None:
            user.full_name = data.full_name.strip() or None
        if data.department is not None:
            user.department = data.department.strip() or None
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def change_own_password(
        self, db: Session, *, user_id: int, current_password: str, new_password: str
    ) -> None:
        user = self.get_user_by_id(db, user_id)
        if not user or not verify_password(current_password, user.password_hash):
            raise UnauthorizedException(
                "Current password is incorrect.", code="WRONG_PASSWORD"
            )
        user.password_hash = hash_password(new_password)
        db.add(user)
        db.commit()

    def delete_user(self, db: Session, *, tenant_id: int, user_id: int) -> None:
        from app.core.exceptions import NotFoundException

        user = db.scalar(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
        if not user:
            raise NotFoundException("Kullanıcı bulunamadı.", code="USER_NOT_FOUND")
        db.delete(user)
        db.commit()

    def forgot_password(self, db: Session, *, tenant_slug: str, email: str) -> str | None:
        """Create a password reset token. Returns the raw token (for email sending) or None if user not found.

        Never reveals whether the email exists — callers should always return a 200 response.
        """
        from sqlalchemy import func as sa_func

        # Find tenant
        tid: int | None = None
        if tenant_slug.strip():
            tid = db.scalar(select(Tenant.id).where(
                (Tenant.slug == tenant_slug.lower()) | (sa_func.lower(Tenant.name) == tenant_slug.lower())
            ))

        # Find user (tenant or platform admin)
        if tid:
            user = db.scalar(select(User).where(User.tenant_id == tid, User.email == email.lower(), User.is_active.is_(True)))
        else:
            user = db.scalar(select(User).where(User.email == email.lower(), User.is_active.is_(True)))

        if not user:
            return None

        # Revoke existing unused tokens for this user
        existing = db.scalars(select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )).all()
        for tok in existing:
            db.delete(tok)

        raw = secrets.token_urlsafe(32)
        token_hash = sha256(raw.encode()).hexdigest()
        expires = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES)
        prt = PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires)
        db.add(prt)
        db.commit()
        return raw

    def reset_password(self, db: Session, *, token: str, new_password: str) -> None:
        from app.core.exceptions import NotFoundException

        token_hash = sha256(token.encode()).hexdigest()
        row = db.scalar(select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
        ))
        if not row:
            raise NotFoundException("Invalid or expired reset token.", code="INVALID_RESET_TOKEN")
        if row.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            db.delete(row)
            db.commit()
            raise NotFoundException("Reset token has expired.", code="RESET_TOKEN_EXPIRED")

        user = self.get_user_by_id(db, row.user_id)
        if not user or not user.is_active:
            raise NotFoundException("User not found.", code="USER_NOT_FOUND")

        user.password_hash = hash_password(new_password)
        row.used_at = datetime.now(timezone.utc)
        db.add(user)
        db.add(row)
        db.commit()


auth_service = AuthService()
