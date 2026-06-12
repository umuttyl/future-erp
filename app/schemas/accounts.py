from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PaymentCreate(BaseModel):
    amount: Decimal
    description: Optional[str] = None
    movement_date: date
    invoice_no: Optional[str] = None  # hangi faturanın tahsilatı (SalesRecord + COGS için)


class AccountMovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    movement_type: str
    amount: Decimal
    description: Optional[str]
    reference: Optional[str]
    sales_record_id: Optional[int]
    movement_date: date
    created_at: datetime


class StatementEntryOut(BaseModel):
    id: int
    movement_date: date
    movement_type: str
    description: Optional[str]
    reference: Optional[str]
    debit: Decimal
    credit: Decimal
    balance: Decimal


class CustomerBalanceOut(BaseModel):
    customer_id: int
    customer_name: str
    balance: Decimal


class StatementOut(BaseModel):
    customer_id: int
    customer_name: str
    opening_balance: Decimal
    closing_balance: Decimal
    entries: list[StatementEntryOut]
