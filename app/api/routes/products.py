from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import NotFoundException, ValidationException
from app.core.permissions import (
    CATALOG_PRODUCT_DELETE,
    CATALOG_PRODUCT_READ,
    CATALOG_PRODUCT_WRITE,
    STOCK_ADJUST,
)
from app.schemas.product import (
    ProductCreate,
    ProductOut,
    ProductUpdate,
    StockAdjustRequest,
    StockMovementOut,
)
from app.services.products_service import products_service

router = APIRouter()


@router.get("", response_model=list[ProductOut])
def list_products(
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(CATALOG_PRODUCT_READ)),
    db: Session = Depends(get_db),
):
    return products_service.list(db, ctx.tenant_id)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(CATALOG_PRODUCT_WRITE)),
    db: Session = Depends(get_db),
):
    return products_service.create(db, ctx.tenant_id, payload)


@router.get("/movements", response_model=List[StockMovementOut])
def list_stock_movements(
    product_id: Optional[int] = None,
    limit: int = 200,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(CATALOG_PRODUCT_READ)),
    db: Session = Depends(get_db),
):
    return products_service.list_movements(db, ctx.tenant_id, product_id=product_id, limit=limit)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(CATALOG_PRODUCT_READ)),
    db: Session = Depends(get_db),
):
    obj = products_service.get(db, ctx.tenant_id, product_id)
    if not obj:
        raise NotFoundException("Ürün bulunamadı.", code="PRODUCT_NOT_FOUND")
    return obj


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(CATALOG_PRODUCT_WRITE)),
    db: Session = Depends(get_db),
):
    obj = products_service.get(db, ctx.tenant_id, product_id)
    if not obj:
        raise NotFoundException("Ürün bulunamadı.", code="PRODUCT_NOT_FOUND")
    return products_service.update(db, ctx.tenant_id, obj, payload)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(CATALOG_PRODUCT_DELETE)),
    db: Session = Depends(get_db),
):
    obj = products_service.get(db, ctx.tenant_id, product_id)
    if not obj:
        raise NotFoundException("Ürün bulunamadı.", code="PRODUCT_NOT_FOUND")
    products_service.delete(db, ctx.tenant_id, obj)
    return None


@router.post("/{product_id}/stock", response_model=ProductOut)
def adjust_stock(
    product_id: int,
    payload: StockAdjustRequest,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(STOCK_ADJUST)),
    db: Session = Depends(get_db),
):
    obj = products_service.get(db, ctx.tenant_id, product_id)
    if not obj:
        raise NotFoundException("Ürün bulunamadı.", code="PRODUCT_NOT_FOUND")
    try:
        product, _movement = products_service.adjust_stock(db, ctx.tenant_id, obj, payload)
        return product
    except ValueError as e:
        raise ValidationException(str(e), code="INSUFFICIENT_STOCK") from e
