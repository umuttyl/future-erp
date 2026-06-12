from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.account_movement import AccountMovement
from app.models.customer import Customer
from app.schemas.accounts import CustomerBalanceOut, StatementEntryOut, StatementOut

_DEBIT_TYPES = frozenset({"debit"})
_CREDIT_TYPES = frozenset({"payment", "credit", "refund"})


class AccountsService:
    def _balance_query(self, db: Session, tenant_id: int, customer_id: int) -> Decimal:
        debits = db.scalar(
            select(func.coalesce(func.sum(AccountMovement.amount), 0)).where(
                AccountMovement.tenant_id == tenant_id,
                AccountMovement.customer_id == customer_id,
                AccountMovement.movement_type.in_(_DEBIT_TYPES),
            )
        ) or Decimal("0")
        credits = db.scalar(
            select(func.coalesce(func.sum(AccountMovement.amount), 0)).where(
                AccountMovement.tenant_id == tenant_id,
                AccountMovement.customer_id == customer_id,
                AccountMovement.movement_type.in_(_CREDIT_TYPES),
            )
        ) or Decimal("0")
        return Decimal(str(debits)) - Decimal(str(credits))

    def customer_balance(self, db: Session, tenant_id: int, customer_id: int) -> Decimal:
        return self._balance_query(db, tenant_id, customer_id)

    def list_balances(self, db: Session, tenant_id: int) -> list[CustomerBalanceOut]:
        customers = db.scalars(
            select(Customer).where(
                Customer.tenant_id == tenant_id,
                Customer.deleted_at.is_(None),
            )
        ).all()
        result = []
        for c in customers:
            bal = self._balance_query(db, tenant_id, c.id)
            result.append(CustomerBalanceOut(customer_id=c.id, customer_name=c.name, balance=bal))
        return result

    def customer_statement(
        self,
        db: Session,
        tenant_id: int,
        customer_id: int,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> StatementOut:
        customer = db.scalar(
            select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
        )
        if customer is None:
            from app.core.exceptions import NotFoundException
            raise NotFoundException("Müşteri bulunamadı.", code="CUSTOMER_NOT_FOUND")

        # Opening balance: sum of all movements BEFORE start_date
        opening = Decimal("0")
        if start_date:
            opening = self._balance_before(db, tenant_id, customer_id, start_date)

        # Movements in range
        stmt = (
            select(AccountMovement)
            .where(
                AccountMovement.tenant_id == tenant_id,
                AccountMovement.customer_id == customer_id,
            )
            .order_by(AccountMovement.movement_date.asc(), AccountMovement.id.asc())
        )
        if start_date:
            stmt = stmt.where(AccountMovement.movement_date >= start_date)
        if end_date:
            stmt = stmt.where(AccountMovement.movement_date <= end_date)

        movements = db.scalars(stmt).all()

        entries: list[StatementEntryOut] = []
        running = opening
        for m in movements:
            if m.movement_type in _DEBIT_TYPES:
                debit = Decimal(str(m.amount))
                credit = Decimal("0")
                running += debit
            else:
                debit = Decimal("0")
                credit = Decimal(str(m.amount))
                running -= credit
            entries.append(
                StatementEntryOut(
                    id=m.id,
                    movement_date=m.movement_date,
                    movement_type=m.movement_type,
                    description=m.description,
                    reference=m.reference,
                    debit=debit,
                    credit=credit,
                    balance=running,
                )
            )

        return StatementOut(
            customer_id=customer_id,
            customer_name=customer.name,
            opening_balance=opening,
            closing_balance=running,
            entries=entries,
        )

    def _balance_before(self, db: Session, tenant_id: int, customer_id: int, cutoff: date) -> Decimal:
        debits = db.scalar(
            select(func.coalesce(func.sum(AccountMovement.amount), 0)).where(
                AccountMovement.tenant_id == tenant_id,
                AccountMovement.customer_id == customer_id,
                AccountMovement.movement_type.in_(_DEBIT_TYPES),
                AccountMovement.movement_date < cutoff,
            )
        ) or Decimal("0")
        credits = db.scalar(
            select(func.coalesce(func.sum(AccountMovement.amount), 0)).where(
                AccountMovement.tenant_id == tenant_id,
                AccountMovement.customer_id == customer_id,
                AccountMovement.movement_type.in_(_CREDIT_TYPES),
                AccountMovement.movement_date < cutoff,
            )
        ) or Decimal("0")
        return Decimal(str(debits)) - Decimal(str(credits))

    def add_debit(
        self,
        db: Session,
        *,
        tenant_id: int,
        customer_id: int,
        amount: Decimal,
        description: Optional[str] = None,
        reference: Optional[str] = None,
        sales_record_id: Optional[int] = None,
        movement_date: Optional[date] = None,
    ) -> AccountMovement:
        from datetime import date as date_type
        m = AccountMovement(
            tenant_id=tenant_id,
            customer_id=customer_id,
            movement_type="debit",
            amount=amount,
            description=description,
            reference=reference,
            sales_record_id=sales_record_id,
            movement_date=movement_date or date_type.today(),
        )
        db.add(m)
        db.flush()
        return m

    def add_payment(
        self,
        db: Session,
        *,
        tenant_id: int,
        customer_id: int,
        amount: Decimal,
        description: Optional[str] = None,
        movement_date: Optional[date] = None,
    ) -> AccountMovement:
        from datetime import date as date_type
        m = AccountMovement(
            tenant_id=tenant_id,
            customer_id=customer_id,
            movement_type="payment",
            amount=amount,
            description=description or "Tahsilat",
            movement_date=movement_date or date_type.today(),
        )
        db.add(m)
        db.flush()
        return m


accounts_service = AccountsService()
