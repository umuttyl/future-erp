from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.expense import Expense
from app.services.cashbook_service import cashbook_service


class ExpenseIn:
    pass


class ExpenseService:
    def list(
        self,
        db: Session,
        *,
        tenant_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        category: Optional[str] = None,
        limit: int = 200,
    ) -> list[Expense]:
        stmt = select(Expense).where(Expense.tenant_id == tenant_id)
        if start_date:
            stmt = stmt.where(Expense.expense_date >= start_date)
        if end_date:
            stmt = stmt.where(Expense.expense_date <= end_date)
        if category:
            stmt = stmt.where(Expense.category == category)
        stmt = stmt.order_by(Expense.expense_date.desc()).limit(limit)
        return list(db.scalars(stmt).all())

    def get(self, db: Session, *, expense_id: int, tenant_id: int) -> Optional[Expense]:
        return db.scalar(
            select(Expense).where(Expense.id == expense_id, Expense.tenant_id == tenant_id)
        )

    def create(
        self,
        db: Session,
        *,
        tenant_id: int,
        user_id: Optional[int],
        category: str,
        description: str,
        amount: float,
        currency: str,
        expense_date: date,
        vendor: Optional[str] = None,
        receipt_ref: Optional[str] = None,
    ) -> Expense:
        exp = Expense(
            tenant_id=tenant_id,
            created_by=user_id,
            category=category,
            description=description,
            amount=amount,
            currency=currency,
            expense_date=expense_date,
            vendor=vendor,
            receipt_ref=receipt_ref,
        )
        db.add(exp)
        db.flush()

        cashbook_service.auto_entry_for_expense(
            db,
            tenant_id=tenant_id,
            amount=Decimal(str(amount)),
            description=f"{category} — {description[:80]}",
            reference=receipt_ref,
            transaction_date=expense_date,
        )

        db.commit()
        db.refresh(exp)
        return exp

    def update(
        self,
        db: Session,
        *,
        expense_id: int,
        tenant_id: int,
        **kwargs: object,
    ) -> Expense:
        from app.core.exceptions import NotFoundException

        exp = self.get(db, expense_id=expense_id, tenant_id=tenant_id)
        if not exp:
            raise NotFoundException("Expense not found.", code="EXPENSE_NOT_FOUND")
        for key, value in kwargs.items():
            if value is not None and hasattr(exp, key):
                setattr(exp, key, value)
        db.add(exp)
        db.commit()
        db.refresh(exp)
        return exp

    def delete(self, db: Session, *, expense_id: int, tenant_id: int) -> None:
        from app.core.exceptions import NotFoundException

        exp = self.get(db, expense_id=expense_id, tenant_id=tenant_id)
        if not exp:
            raise NotFoundException("Expense not found.", code="EXPENSE_NOT_FOUND")
        db.delete(exp)
        db.commit()

    def summary(
        self,
        db: Session,
        *,
        tenant_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> dict:
        stmt = select(
            Expense.category,
            func.sum(Expense.amount).label("total"),
            func.count(Expense.id).label("count"),
        ).where(Expense.tenant_id == tenant_id)
        if start_date:
            stmt = stmt.where(Expense.expense_date >= start_date)
        if end_date:
            stmt = stmt.where(Expense.expense_date <= end_date)
        stmt = stmt.group_by(Expense.category)
        rows = db.execute(stmt).all()

        by_category = [{"category": r.category, "total": float(r.total), "count": r.count} for r in rows]
        grand_total = sum(r["total"] for r in by_category)
        return {"grand_total": grand_total, "by_category": by_category}


expense_service = ExpenseService()
