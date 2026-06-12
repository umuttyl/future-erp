from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx, require_permission
from app.core.permissions import CATALOG_PRODUCT_READ, CATALOG_PRODUCT_WRITE
from app.schemas.supplier import SupplierCreate, SupplierOut, SupplierUpdate
from app.services.suppliers_service import suppliers_service

router = APIRouter()


@router.get("", response_model=List[SupplierOut])
def list_suppliers(
    search: Optional[str] = Query(None, max_length=100),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    _: AuthPrincipal = Depends(require_permission(CATALOG_PRODUCT_READ)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return suppliers_service.list(db, tenant_id=ctx.tenant_id, search=search, skip=skip, limit=limit)


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(
    supplier_id: int,
    _: AuthPrincipal = Depends(require_permission(CATALOG_PRODUCT_READ)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return suppliers_service.get(db, tenant_id=ctx.tenant_id, supplier_id=supplier_id)


@router.post("", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    _: AuthPrincipal = Depends(require_permission(CATALOG_PRODUCT_WRITE)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return suppliers_service.create(db, tenant_id=ctx.tenant_id, data=payload)


@router.patch("/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    _: AuthPrincipal = Depends(require_permission(CATALOG_PRODUCT_WRITE)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return suppliers_service.update(db, tenant_id=ctx.tenant_id, supplier_id=supplier_id, data=payload)


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(
    supplier_id: int,
    _: AuthPrincipal = Depends(require_permission(CATALOG_PRODUCT_WRITE)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    suppliers_service.delete(db, tenant_id=ctx.tenant_id, supplier_id=supplier_id)
    return None
