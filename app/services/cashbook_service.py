from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, NotFoundException
from app.models.cashbook import CashAccount, CashTransaction
from app.schemas.cashbook import (
    CashAccountCreate,
    CashAccountUpdate,
    CashTransactionCreate,
    DailyReportEntry,
    DailyReportOut,
)


class CashbookService:
    # ------------------------------------------------------------------ accounts

    def list_accounts(self, db: Session, *, tenant_id: int) -> list[CashAccount]:
        return list(
            db.scalars(
                select(CashAccount)
                .where(CashAccount.tenant_id == tenant_id)
                .order_by(CashAccount.id.asc())
            ).all()
        )

    def get_account(self, db: Session, *, tenant_id: int, account_id: int) -> CashAccount:
        acc = db.scalar(
            select(CashAccount).where(
                CashAccount.id == account_id, CashAccount.tenant_id == tenant_id
            )
        )
        if acc is None:
            raise NotFoundException("Kasa hesabı bulunamadı.", code="ACCOUNT_NOT_FOUND")
        return acc

    def create_account(
        self, db: Session, *, tenant_id: int, data: CashAccountCreate
    ) -> CashAccount:
        acc = CashAccount(
            tenant_id=tenant_id,
            name=data.name.strip(),
            account_type=data.account_type,
            currency=data.currency.upper(),
            balance=data.opening_balance,
        )
        db.add(acc)
        db.flush()
        # Record opening balance as income if non-zero
        if data.opening_balance > 0:
            tx = CashTransaction(
                tenant_id=tenant_id,
                account_id=acc.id,
                transaction_type="income",
                amount=data.opening_balance,
                balance_after=data.opening_balance,
                description="Açılış bakiyesi",
                transaction_date=date.today(),
            )
            db.add(tx)
        db.commit()
        db.refresh(acc)
        return acc

    def update_account(
        self, db: Session, *, tenant_id: int, account_id: int, data: CashAccountUpdate
    ) -> CashAccount:
        acc = self.get_account(db, tenant_id=tenant_id, account_id=account_id)
        if data.name is not None:
            acc.name = data.name.strip()
        if data.is_active is not None:
            acc.is_active = data.is_active
        db.add(acc)
        db.commit()
        db.refresh(acc)
        return acc

    # ------------------------------------------------------------ transactions

    def list_transactions(
        self,
        db: Session,
        *,
        tenant_id: int,
        account_id: int,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> list[CashTransaction]:
        # Verify account belongs to tenant
        self.get_account(db, tenant_id=tenant_id, account_id=account_id)
        q = select(CashTransaction).where(
            CashTransaction.tenant_id == tenant_id,
            CashTransaction.account_id == account_id,
        )
        if date_from:
            q = q.where(CashTransaction.transaction_date >= date_from)
        if date_to:
            q = q.where(CashTransaction.transaction_date <= date_to)
        q = q.order_by(CashTransaction.id.desc())
        return list(db.scalars(q).all())

    def add_transaction(
        self,
        db: Session,
        *,
        tenant_id: int,
        account_id: int,
        data: CashTransactionCreate,
        sales_record_id: Optional[int] = None,
    ) -> CashTransaction:
        acc = self.get_account(db, tenant_id=tenant_id, account_id=account_id)
        if not acc.is_active:
            raise ConflictException("Hesap pasif durumda.", code="ACCOUNT_INACTIVE")

        is_income = data.transaction_type in ("income", "transfer_in")
        delta = data.amount if is_income else -data.amount
        new_balance = acc.balance + delta

        acc.balance = new_balance
        db.add(acc)

        tx = CashTransaction(
            tenant_id=tenant_id,
            account_id=account_id,
            transaction_type=data.transaction_type,
            amount=data.amount,
            balance_after=new_balance,
            description=data.description,
            reference=data.reference,
            sales_record_id=sales_record_id,
            transaction_date=data.transaction_date,
        )
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return tx

    def auto_entry_from_sale(
        self,
        db: Session,
        *,
        tenant_id: int,
        amount: Decimal,
        sales_record_id: Optional[int] = None,
        description: str = "Satış tahsilatı",
        reference: Optional[str] = None,
        transaction_date: Optional[date] = None,
    ) -> Optional[CashTransaction]:
        """Create an income transaction on the first active cash account for the tenant.

        Returns None (silently) if no active cash account exists.
        """
        acc = db.scalar(
            select(CashAccount).where(
                CashAccount.tenant_id == tenant_id,
                CashAccount.is_active.is_(True),
            ).order_by(CashAccount.id.asc()).limit(1)
        )
        if acc is None:
            return None

        tx_date = transaction_date or date.today()
        new_balance = acc.balance + amount
        acc.balance = new_balance
        db.add(acc)

        tx = CashTransaction(
            tenant_id=tenant_id,
            account_id=acc.id,
            transaction_type="income",
            amount=amount,
            balance_after=new_balance,
            description=description,
            reference=reference,
            sales_record_id=sales_record_id,
            transaction_date=tx_date,
        )
        db.add(tx)
        # Caller commits
        return tx

    def auto_entry_for_expense(
        self,
        db: Session,
        *,
        tenant_id: int,
        amount: Decimal,
        description: str,
        reference: Optional[str] = None,
        transaction_date: Optional[date] = None,
    ) -> Optional[CashTransaction]:
        """Create an expense transaction on the first active cash account for the tenant.

        Returns None (silently) if no active cash account exists.
        """
        acc = db.scalar(
            select(CashAccount).where(
                CashAccount.tenant_id == tenant_id,
                CashAccount.is_active.is_(True),
            ).order_by(CashAccount.id.asc()).limit(1)
        )
        if acc is None:
            return None

        tx_date = transaction_date or date.today()
        new_balance = acc.balance - amount
        acc.balance = new_balance
        db.add(acc)

        tx = CashTransaction(
            tenant_id=tenant_id,
            account_id=acc.id,
            transaction_type="expense",
            amount=amount,
            balance_after=new_balance,
            description=description,
            reference=reference,
            transaction_date=tx_date,
        )
        db.add(tx)
        # Caller commits
        return tx

    # ------------------------------------------------------------ daily report

    def daily_report(
        self, db: Session, *, tenant_id: int, report_date: date
    ) -> DailyReportOut:
        accounts = self.list_accounts(db, tenant_id=tenant_id)
        entries: list[DailyReportEntry] = []

        for acc in accounts:
            txs = list(
                db.scalars(
                    select(CashTransaction).where(
                        CashTransaction.tenant_id == tenant_id,
                        CashTransaction.account_id == acc.id,
                        CashTransaction.transaction_date == report_date,
                    )
                ).all()
            )

            total_income = sum(
                t.amount for t in txs if t.transaction_type in ("income", "transfer_in")
            )
            total_expense = sum(
                t.amount for t in txs if t.transaction_type in ("expense", "transfer_out")
            )
            closing = acc.balance
            opening = closing - total_income + total_expense

            entries.append(
                DailyReportEntry(
                    account_id=acc.id,
                    account_name=acc.name,
                    account_type=acc.account_type,
                    opening_balance=opening,
                    total_income=total_income,
                    total_expense=total_expense,
                    closing_balance=closing,
                    transaction_count=len(txs),
                )
            )

        return DailyReportOut(
            report_date=report_date,
            accounts=entries,
            total_opening=sum(e.opening_balance for e in entries),
            total_income=sum(e.total_income for e in entries),
            total_expense=sum(e.total_expense for e in entries),
            total_closing=sum(e.closing_balance for e in entries),
        )


cashbook_service = CashbookService()
