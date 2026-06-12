from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.permissions import FINANCE_READ
from app.services.finance_service import finance_service

router = APIRouter()


@router.get("/summary")
def finance_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(FINANCE_READ)),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return finance_service.summary(db, ctx.tenant_id, start_date=start_date, end_date=end_date)


@router.get("/monthly")
def finance_monthly(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(FINANCE_READ)),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    return finance_service.monthly_revenue(db, ctx.tenant_id, start_date=start_date, end_date=end_date)


@router.get("/top-customers")
def finance_top_customers(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = 5,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(FINANCE_READ)),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    return finance_service.top_customers(
        db, ctx.tenant_id, start_date=start_date, end_date=end_date, limit=limit
    )


@router.get("/top-products")
def finance_top_products(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = 5,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(FINANCE_READ)),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    return finance_service.top_products(
        db, ctx.tenant_id, start_date=start_date, end_date=end_date, limit=limit
    )
