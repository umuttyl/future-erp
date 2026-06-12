from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class CashAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    account_type: Literal["cash", "bank"] = "cash"
    currency: str = Field(default="TRY", max_length=8)
    opening_balance: Decimal = Field(default=Decimal("0.00"), ge=0)


class CashAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    is_active: Optional[bool] = None


class CashAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    account_type: str
    currency: str
    balance: Decimal
    is_active: bool
    created_at: datetime


class CashTransactionCreate(BaseModel):
    transaction_type: Literal["income", "expense", "transfer_in", "transfer_out"]
    amount: Decimal = Field(gt=0)
    description: Optional[str] = Field(None, max_length=512)
    reference: Optional[str] = Field(None, max_length=128)
    transaction_date: date


class CashTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    account_id: int
    transaction_type: str
    amount: Decimal
    balance_after: Decimal
    description: Optional[str] = None
    reference: Optional[str] = None
    sales_record_id: Optional[int] = None
    transaction_date: date
    created_at: datetime


class DailyReportEntry(BaseModel):
    account_id: int
    account_name: str
    account_type: str
    opening_balance: Decimal
    total_income: Decimal
    total_expense: Decimal
    closing_balance: Decimal
    transaction_count: int


class DailyReportOut(BaseModel):
    report_date: date
    accounts: list[DailyReportEntry]
    total_opening: Decimal
    total_income: Decimal
    total_expense: Decimal
    total_closing: Decimal
