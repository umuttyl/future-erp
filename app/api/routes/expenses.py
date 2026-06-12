from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_current_principal, get_tenant_ctx
from app.services.expense_service import expense_service

router = APIRouter()

CATEGORIES = ["rent", "salary", "utilities", "marketing", "logistics", "tax", "other"]


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    category: str
    description: str
    amount: float
    currency: str
    expense_date: date
    vendor: Optional[str] = None
    receipt_ref: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime


class ExpenseCreateIn(BaseModel):
    category: str = Field(default="other")
    description: str = Field(min_length=1, max_length=500)
    amount: float = Field(gt=0)
    currency: str = Field(default="TRY", max_length=8)
    expense_date: date
    vendor: Optional[str] = Field(None, max_length=255)
    receipt_ref: Optional[str] = Field(None, max_length=128)


class ExpenseUpdateIn(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = Field(None, min_length=1, max_length=500)
    amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None, max_length=8)
    expense_date: Optional[date] = None
    vendor: Optional[str] = Field(None, max_length=255)
    receipt_ref: Optional[str] = Field(None, max_length=128)


class ExpenseSummaryOut(BaseModel):
    grand_total: float
    by_category: list[dict]


@router.get("", response_model=list[ExpenseOut])
def list_expenses(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    category: Optional[str] = Query(None),
    _: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return expense_service.list(
        db,
        tenant_id=ctx.tenant_id,
        start_date=start_date,
        end_date=end_date,
        category=category,
    )


@router.get("/summary", response_model=ExpenseSummaryOut)
def expense_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    _: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return expense_service.summary(
        db, tenant_id=ctx.tenant_id, start_date=start_date, end_date=end_date
    )


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreateIn,
    principal: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return expense_service.create(
        db,
        tenant_id=ctx.tenant_id,
        user_id=principal.user_id,
        **payload.model_dump(),
    )


@router.patch("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdateIn,
    _: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return expense_service.update(
        db,
        expense_id=expense_id,
        tenant_id=ctx.tenant_id,
        **{k: v for k, v in payload.model_dump().items() if v is not None},
    )


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    _: AuthPrincipal = Depends(get_current_principal),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    expense_service.delete(db, expense_id=expense_id, tenant_id=ctx.tenant_id)
    return None
