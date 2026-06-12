from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.job_role_template import JobRoleTemplate
    from app.models.tenant import Tenant


class User(Base):
    __tablename__ = "users"
    # Unique constraint kaldırıldı — migration'da partial index ile değiştirildi
    # (NULL tenant_id olan platform admin için SQL NULL != NULL semantiği sorun yaratıyordu)

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    #: Platform operatörü mü? True = SaaS admin, tenant_id=NULL, tüm izinler.
    is_platform_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    #: Şirket içi rol: 'owner' (tüm izinler) | 'staff' (job_role bazlı)
    role_kind: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="staff", index=True
    )
    job_role_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("job_role_templates.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped[Optional["Tenant"]] = relationship(back_populates="users")
    job_role: Mapped[Optional["JobRoleTemplate"]] = relationship(lazy="select")

    @property
    def role(self) -> str:
        """Türetilmiş etiket (DB'de saklanmaz). Tek kaynak: derive_role_label()."""
        from app.core.permissions import derive_role_label
        return derive_role_label(self.is_platform_admin, self.role_kind)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Token replay attack önlemi: ilk kullanımda set edilir; set ise ikinci kullanım reddedilir.
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
