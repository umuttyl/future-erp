from __future__ import annotations

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, require_permission
from app.core.permissions import CASHBOOK_READ, CASHBOOK_WRITE
from app.schemas.cashbook import (
    CashAccountCreate,
    CashAccountOut,
    CashAccountUpdate,
    CashTransactionCreate,
    CashTransactionOut,
    DailyReportOut,
)
from app.services.cashbook_service import cashbook_service

router = APIRouter()


@router.get("/accounts", response_model=list[CashAccountOut])
def list_accounts(
    principal: Annotated[AuthPrincipal, Depends(require_permission(CASHBOOK_READ))],
    db: Session = Depends(get_db),
) -> list[CashAccountOut]:
    return cashbook_service.list_accounts(db, tenant_id=principal.tenant_id)  # type: ignore[return-value]


@router.post("/accounts", response_model=CashAccountOut, status_code=201)
def create_account(
    body: CashAccountCreate,
    principal: Annotated[AuthPrincipal, Depends(require_permission(CASHBOOK_WRITE))],
    db: Session = Depends(get_db),
) -> CashAccountOut:
    acc = cashbook_service.create_account(db, tenant_id=principal.tenant_id, data=body)
    return acc  # type: ignore[return-value]


@router.patch("/accounts/{account_id}", response_model=CashAccountOut)
def update_account(
    account_id: int,
    body: CashAccountUpdate,
    principal: Annotated[AuthPrincipal, Depends(require_permission(CASHBOOK_WRITE))],
    db: Session = Depends(get_db),
) -> CashAccountOut:
    acc = cashbook_service.update_account(
        db, tenant_id=principal.tenant_id, account_id=account_id, data=body
    )
    return acc  # type: ignore[return-value]


@router.get("/accounts/{account_id}/transactions", response_model=list[CashTransactionOut])
def list_transactions(
    account_id: int,
    principal: Annotated[AuthPrincipal, Depends(require_permission(CASHBOOK_READ))],
    db: Session = Depends(get_db),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
) -> list[CashTransactionOut]:
    return cashbook_service.list_transactions(  # type: ignore[return-value]
        db,
        tenant_id=principal.tenant_id,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.post(
    "/accounts/{account_id}/transactions",
    response_model=CashTransactionOut,
    status_code=201,
)
def add_transaction(
    account_id: int,
    body: CashTransactionCreate,
    principal: Annotated[AuthPrincipal, Depends(require_permission(CASHBOOK_WRITE))],
    db: Session = Depends(get_db),
) -> CashTransactionOut:
    tx = cashbook_service.add_transaction(
        db,
        tenant_id=principal.tenant_id,
        account_id=account_id,
        data=body,
    )
    return tx  # type: ignore[return-value]


@router.get("/daily-report", response_model=DailyReportOut)
def daily_report(
    principal: Annotated[AuthPrincipal, Depends(require_permission(CASHBOOK_READ))],
    db: Session = Depends(get_db),
    report_date: date = Query(default_factory=date.today),
) -> DailyReportOut:
    return cashbook_service.daily_report(
        db, tenant_id=principal.tenant_id, report_date=report_date
    )
