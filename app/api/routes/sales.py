from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import NotFoundException, ValidationException
from app.core.permissions import SALES_READ, SALES_WRITE
from app.models.sales import SalesItem, SalesRecord
from app.schemas.sales import SalesRecordCreate, SalesRecordOut
from app.services.sales_service import sales_service

router = APIRouter()


@router.get("/records", response_model=list[SalesRecordOut])
def list_sales_records(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    customer: Optional[str] = None,
    search: Optional[str] = None,
    min_amount: Optional[float] = None,
    limit: int = 500,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(SALES_READ)),
    db: Session = Depends(get_db),
):
    return sales_service.list_records(
        db,
        ctx.tenant_id,
        start_date=start_date,
        end_date=end_date,
        customer=customer,
        search=search,
        min_amount=min_amount,
        limit=limit,
    )


@router.get("/records/{record_id}", response_model=SalesRecordOut)
def get_sales_record(
    record_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(SALES_READ)),
    db: Session = Depends(get_db),
):
    obj = sales_service.get_record(db, ctx.tenant_id, record_id)
    if not obj:
        raise NotFoundException("Satış kaydı bulunamadı.", code="SALES_RECORD_NOT_FOUND")
    return obj


@router.post("/records", response_model=SalesRecordOut, status_code=status.HTTP_201_CREATED)
def create_sales_record(
    payload: SalesRecordCreate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(SALES_WRITE)),
    db: Session = Depends(get_db),
):
    try:
        return sales_service.create_record(db, ctx.tenant_id, payload)
    except ValueError as e:
        raise ValidationException(str(e)) from e


class DailySalesPoint(BaseModel):
    date: date
    quantity: int
    revenue: float


@router.get("/analytics/daily", response_model=List[DailySalesPoint])
def daily_sales_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(SALES_READ)),
    db: Session = Depends(get_db),
):
    stmt = (
        select(
            SalesRecord.sale_date.label("date"),
            func.coalesce(func.sum(SalesItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(SalesItem.line_total), 0).label("revenue"),
        )
        .join(SalesItem, SalesItem.sales_record_id == SalesRecord.id)
        .where(SalesRecord.tenant_id == ctx.tenant_id)
        .where(SalesItem.tenant_id == ctx.tenant_id)
        .group_by(SalesRecord.sale_date)
        .order_by(SalesRecord.sale_date.asc())
    )

    if start_date is not None:
        stmt = stmt.where(SalesRecord.sale_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(SalesRecord.sale_date <= end_date)

    rows = db.execute(stmt).all()
    return [
        DailySalesPoint(date=r.date, quantity=int(r.quantity), revenue=float(r.revenue))
        for r in rows
    ]
