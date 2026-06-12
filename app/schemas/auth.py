from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator


class LoginIn(BaseModel):
    tenant_slug: str = Field(default="default", max_length=64)
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


def _password_strength(v: str) -> str:
    if not any(c.isupper() for c in v):
        raise ValueError("Şifre en az bir büyük harf içermelidir.")
    if not any(c.isdigit() for c in v):
        raise ValueError("Şifre en az bir rakam içermelidir.")
    return v


class RegisterIn(BaseModel):
    organization_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    full_name: Optional[str] = Field(None, max_length=255)
    department: Optional[str] = Field(None, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _password_strength(v)


class SignupIn(BaseModel):
    """Yeni şirket + ilk yönetici kaydı (çok kiracılı). ``/api/auth/signup``."""

    organization_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    full_name: str = Field(min_length=1, max_length=255)
    department: Optional[str] = Field(None, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _password_strength(v)


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RegisterOut(TokenPairOut):
    tenant_slug: str


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=10)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: Optional[int] = None
    email: str
    is_platform_admin: bool = False
    role_kind: str = "staff"
    job_role_id: Optional[int] = None
    is_active: bool
    full_name: Optional[str] = None
    department: Optional[str] = None

    @computed_field  # type: ignore[misc]
    @property
    def role(self) -> str:
        from app.core.permissions import derive_role_label
        return derive_role_label(self.is_platform_admin, self.role_kind)


class UserUpdateIn(BaseModel):
    role: Optional[Literal["admin", "manager", "employee"]] = None   # geriye uyumluluk
    role_kind: Optional[Literal["owner", "staff"]] = None
    job_role_id: Optional[int] = None
    full_name: Optional[str] = Field(None, max_length=255)
    department: Optional[str] = Field(None, max_length=128)
    is_active: Optional[bool] = None
    new_password: Optional[str] = Field(None, min_length=8, max_length=256)

    @field_validator("new_password")
    @classmethod
    def password_strength_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _password_strength(v)


class MeUpdateIn(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    department: Optional[str] = Field(None, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _password_strength(v)


class MeOut(BaseModel):
    id: int
    tenant_id: Optional[int] = None
    email: str
    is_platform_admin: bool = False
    role_kind: str = "staff"
    permissions: list[str]
    tenant_name: Optional[str] = None
    tenant_slug: Optional[str] = None
    full_name: Optional[str] = None
    department: Optional[str] = None
    onboarding_completed: bool = False
    currency: str = "TRY"
    language: str = "tr"

    @computed_field  # type: ignore[misc]
    @property
    def role(self) -> str:
        from app.core.permissions import derive_role_label
        return derive_role_label(self.is_platform_admin, self.role_kind)


class AdminUserCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    role: Optional[Literal["admin", "manager", "employee"]] = None   # geriye uyumluluk
    role_kind: Optional[Literal["owner", "staff"]] = None
    job_role_id: Optional[int] = None
    full_name: Optional[str] = Field(None, max_length=255)
    department: Optional[str] = Field(None, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _password_strength(v)


class ForgotPasswordIn(BaseModel):
    tenant_slug: str = Field(default="", max_length=64)
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _password_strength(v)


class ForgotPasswordOut(BaseModel):
    detail: str = "If that email exists, a reset link has been sent."


class ResetPasswordOut(BaseModel):
    detail: str = "Password updated successfully."
