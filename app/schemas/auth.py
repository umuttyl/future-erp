from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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
    tenant_id: int
    email: str
    role: str
    is_active: bool
    full_name: Optional[str] = None
    department: Optional[str] = None


class MeOut(BaseModel):
    id: int
    tenant_id: int
    email: str
    role: str
    permissions: list[str]
    tenant_name: Optional[str] = None
    full_name: Optional[str] = None
    department: Optional[str] = None


class AdminUserCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    role: Literal["admin", "manager", "employee"]
    full_name: Optional[str] = Field(None, max_length=255)
    department: Optional[str] = Field(None, max_length=128)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _password_strength(v)
