from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.customer import Customer


class TeamTask(Base):
    __tablename__ = "team_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE", name="fk_team_tasks_tenant_id"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    assignee_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", name="fk_team_tasks_assignee_id"),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL", name="fk_team_tasks_created_by"),
        nullable=True,
        index=True,
    )
    customer_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL", name="fk_team_tasks_customer_id"),
        nullable=True,
        index=True,
    )
    supply_order_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("supply_orders.id", ondelete="SET NULL", name="fk_team_tasks_supply_order_id"),
        nullable=True,
        index=True,
    )
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")  # low|medium|high
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="todo", index=True)  # todo|in_progress|done
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    assignee: Mapped[Optional["User"]] = relationship(  # noqa: F821
        "User", foreign_keys=[assignee_id], lazy="select"
    )
    creator: Mapped[Optional["User"]] = relationship(  # noqa: F821
        "User", foreign_keys=[created_by_user_id], lazy="select"
    )
    customer: Mapped[Optional["Customer"]] = relationship(  # noqa: F821
        "Customer", foreign_keys=[customer_id], lazy="select"
    )
