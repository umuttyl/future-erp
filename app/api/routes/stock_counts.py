from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import NotFoundException, ValidationException
from app.core.permissions import STOCK_ADJUST, CATALOG_PRODUCT_READ
from app.schemas.stock_count import StockCountCreate, StockCountOut
from app.services.stock_count_service import stock_count_service

router = APIRouter()


@router.get("", response_model=List[StockCountOut])
def list_counts(
    skip: int = 0,
    limit: int = 50,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(CATALOG_PRODUCT_READ)),
    db: Session = Depends(get_db),
):
    return stock_count_service.list(db, ctx.tenant_id, skip=skip, limit=limit)


@router.post("", response_model=StockCountOut, status_code=status.HTTP_201_CREATED)
def create_count(
    body: StockCountCreate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    principal: AuthPrincipal = Depends(require_permission(STOCK_ADJUST)),
    db: Session = Depends(get_db),
):
    try:
        return stock_count_service.create(
            db, ctx.tenant_id, body, created_by_user_id=principal.user_id
        )
    except ValueError as e:
        raise ValidationException(str(e))


@router.get("/{count_id}", response_model=StockCountOut)
def get_count(
    count_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(CATALOG_PRODUCT_READ)),
    db: Session = Depends(get_db),
):
    count = stock_count_service.get(db, ctx.tenant_id, count_id)
    if not count:
        raise NotFoundException("Stock count not found")
    return count


@router.post("/{count_id}/complete", response_model=StockCountOut)
def complete_count(
    count_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(STOCK_ADJUST)),
    db: Session = Depends(get_db),
):
    count = stock_count_service.get(db, ctx.tenant_id, count_id)
    if not count:
        raise NotFoundException("Stock count not found")
    try:
        return stock_count_service.complete(db, ctx.tenant_id, count)
    except ValueError as e:
        raise ValidationException(str(e))


@router.post("/{count_id}/cancel", response_model=StockCountOut)
def cancel_count(
    count_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(STOCK_ADJUST)),
    db: Session = Depends(get_db),
):
    count = stock_count_service.get(db, ctx.tenant_id, count_id)
    if not count:
        raise NotFoundException("Stock count not found")
    try:
        return stock_count_service.cancel(db, ctx.tenant_id, count)
    except ValueError as e:
        raise ValidationException(str(e))
