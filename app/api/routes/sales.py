from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import NotFoundException, ValidationException
from app.core.permissions import SALES_READ, SALES_WRITE
from app.schemas.sales import DailySalesPoint, SalesRecordCreate, SalesRecordOut
from app.services.sales_service import sales_service

router = APIRouter()


@router.get("/records", response_model=list[SalesRecordOut])
def list_sales_records(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    customer: Optional[str] = None,
    search: Optional[str] = None,
    min_amount: Optional[float] = None,
    skip: int = 0,
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
        skip=skip,
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


@router.get("/analytics/daily", response_model=List[DailySalesPoint])
def daily_sales_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(SALES_READ)),
    db: Session = Depends(get_db),
):
    return sales_service.daily_sales_points(
        db, ctx.tenant_id, start_date=start_date, end_date=end_date
    )
