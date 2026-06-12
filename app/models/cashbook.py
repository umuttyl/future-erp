from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class CashAccount(Base):
    __tablename__ = "cash_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE", name="fk_cash_accounts_tenant_id"),
        index=True, nullable=False,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    account_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="cash", server_default="cash"
    )  # 'cash' | 'bank'
    currency: Mapped[str] = mapped_column(
        String(8), nullable=False, default="TRY", server_default="TRY"
    )
    balance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    transactions: Mapped[list["CashTransaction"]] = relationship(
        back_populates="account", lazy="select", cascade="all, delete-orphan"
    )


class CashTransaction(Base):
    __tablename__ = "cash_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE", name="fk_cash_transactions_tenant_id"),
        index=True, nullable=False,
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("cash_accounts.id", ondelete="CASCADE", name="fk_cash_transactions_account_id"),
        nullable=False, index=True,
    )
    transaction_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # 'income' | 'expense' | 'transfer_in' | 'transfer_out'
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    sales_record_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sales_records.id", ondelete="SET NULL", name="fk_cash_transactions_sales_record_id"),
        nullable=True, index=True,
    )
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    account: Mapped["CashAccount"] = relationship(back_populates="transactions", lazy="select")
