"""14-day cashflow simulation (3-7).

Logic:
- current_balance  = sum of active CashAccount balances
- daily_income_avg = avg daily sales revenue (last 60 days)
- daily_expense_avg = avg daily CashTransaction expenses (last 60 days)
- net_daily        = daily_income_avg - daily_expense_avg
- Project forward 14 days; flag danger (<0) and warning (<20% of current) days.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.cashbook import CashAccount, CashTransaction
from app.models.sales import SalesItem, SalesRecord

FORECAST_HORIZON = 14
LOOKBACK_DAYS = 60
WARNING_RATIO = 0.20  # warn when projected balance < 20 % of current


@dataclass
class CashflowDay:
    date: str
    balance: float
    status: str  # "ok" | "warning" | "danger"


@dataclass
class CashflowForecast:
    current_balance: float
    daily_income_avg: float
    daily_expense_avg: float
    net_daily: float
    horizon_days: int
    projection: List[CashflowDay] = field(default_factory=list)
    first_danger_date: Optional[str] = None
    first_warning_date: Optional[str] = None
    status: str = "ok"
    alert_message: Optional[str] = None
    lookback_days: int = LOOKBACK_DAYS
    has_cashbook_data: bool = False


_TR_MONTHS = [
    "Oca", "Şub", "Mar", "Nis", "May", "Haz",
    "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
]


def _tr_date(d: date) -> str:
    return f"{d.day} {_TR_MONTHS[d.month - 1]}"


def compute_cashflow_forecast(db: Session, *, tenant_id: int) -> CashflowForecast:
    today = date.today()
    lookback_start = today - timedelta(days=LOOKBACK_DAYS)

    # ── 1. Current balance ───────────────────────────────────────────────────
    bal_row = db.execute(
        select(func.coalesce(func.sum(CashAccount.balance), 0))
        .where(CashAccount.tenant_id == tenant_id, CashAccount.is_active == True)  # noqa: E712
    ).scalar_one()
    current_balance = float(bal_row)

    # ── 2. Daily income avg from sales ───────────────────────────────────────
    inc_row = db.execute(
        select(func.coalesce(func.sum(SalesItem.line_total), 0))
        .join(SalesRecord, SalesRecord.id == SalesItem.sales_record_id)
        .where(
            SalesRecord.tenant_id == tenant_id,
            SalesItem.tenant_id == tenant_id,
            SalesRecord.sale_date >= lookback_start,
            SalesRecord.sale_date <= today,
        )
    ).scalar_one()
    daily_income_avg = float(inc_row) / LOOKBACK_DAYS

    # ── 3. Daily expense avg from cashbook ───────────────────────────────────
    exp_row = db.execute(
        select(func.coalesce(func.sum(CashTransaction.amount), 0))
        .where(
            CashTransaction.tenant_id == tenant_id,
            CashTransaction.transaction_type == "expense",
            CashTransaction.transaction_date >= lookback_start,
            CashTransaction.transaction_date <= today,
        )
    ).scalar_one()
    total_expense = float(exp_row)
    daily_expense_avg = total_expense / LOOKBACK_DAYS
    has_cashbook_data = total_expense > 0

    net_daily = daily_income_avg - daily_expense_avg

    # ── 4. Project 14 days ───────────────────────────────────────────────────
    # warning_threshold only makes sense when current balance is positive
    warning_threshold = current_balance * WARNING_RATIO if current_balance > 0 else 0
    projection: List[CashflowDay] = []
    first_danger_date: Optional[str] = None
    first_warning_date: Optional[str] = None
    bal = current_balance

    for d in range(1, FORECAST_HORIZON + 1):
        day = today + timedelta(days=d)
        bal += net_daily
        if bal < 0:
            status = "danger"
            if first_danger_date is None:
                first_danger_date = day.isoformat()
        elif warning_threshold > 0 and bal < warning_threshold:
            status = "warning"
            if first_warning_date is None and first_danger_date is None:
                first_warning_date = day.isoformat()
        else:
            status = "ok"
        projection.append(CashflowDay(date=day.isoformat(), balance=round(bal, 2), status=status))

    # ── 5. Aggregate status + alert message ──────────────────────────────────
    # Check current balance first — negative balance is always danger regardless of forecast
    overall_status = "ok"
    alert_message: Optional[str] = None

    if current_balance < 0:
        overall_status = "danger"
        alert_message = (
            f"Güncel kasa bakiyeniz negatif: {current_balance:,.0f} ₺. "
            "Acil nakit girişi gerekiyor."
        )
    elif first_danger_date:
        overall_status = "danger"
        danger_day = date.fromisoformat(first_danger_date)
        days_until = (danger_day - today).days
        projected_bal = next(p.balance for p in projection if p.date == first_danger_date)
        alert_message = (
            f"{days_until} gün içinde ({_tr_date(danger_day)}) nakit açığı oluşabilir. "
            f"Tahmini bakiye: {projected_bal:,.0f} ₺."
        )
    elif first_warning_date:
        overall_status = "warning"
        warn_day = date.fromisoformat(first_warning_date)
        days_until = (warn_day - today).days
        alert_message = (
            f"{days_until} gün içinde ({_tr_date(warn_day)}) nakit rezervi düşük seviyeye inecek. "
            "Tahsilat hızlandırmanızı veya giderleri ertelemenizi öneririz."
        )

    return CashflowForecast(
        current_balance=round(current_balance, 2),
        daily_income_avg=round(daily_income_avg, 2),
        daily_expense_avg=round(daily_expense_avg, 2),
        net_daily=round(net_daily, 2),
        horizon_days=FORECAST_HORIZON,
        projection=projection,
        first_danger_date=first_danger_date,
        first_warning_date=first_warning_date,
        status=overall_status,
        alert_message=alert_message,
        lookback_days=LOOKBACK_DAYS,
        has_cashbook_data=has_cashbook_data,
    )
