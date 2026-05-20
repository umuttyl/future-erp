from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx, require_permission
from app.core.permissions import SALES_READ, SALES_WRITE
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate
from app.services.customers_service import customers_service

router = APIRouter()


@router.get("", response_model=List[CustomerOut])
def list_customers(
    search: Optional[str] = Query(None, max_length=100),
    customer_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    _: AuthPrincipal = Depends(require_permission(SALES_READ)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return customers_service.list(
        db,
        tenant_id=ctx.tenant_id,
        search=search,
        customer_type=customer_type,
        skip=skip,
        limit=limit,
    )


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    _: AuthPrincipal = Depends(require_permission(SALES_READ)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return customers_service.get(db, tenant_id=ctx.tenant_id, customer_id=customer_id)


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    _: AuthPrincipal = Depends(require_permission(SALES_WRITE)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return customers_service.create(db, tenant_id=ctx.tenant_id, data=payload)


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    _: AuthPrincipal = Depends(require_permission(SALES_WRITE)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    return customers_service.update(db, tenant_id=ctx.tenant_id, customer_id=customer_id, data=payload)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: int,
    _: AuthPrincipal = Depends(require_permission(SALES_WRITE)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    customers_service.delete(db, tenant_id=ctx.tenant_id, customer_id=customer_id)
    return None
