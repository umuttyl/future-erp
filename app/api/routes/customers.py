from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx, require_permission
from app.core.permissions import SALES_READ, SALES_WRITE
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate
from app.services.customers_service import customers_service
from app.services.customer_timeline_service import get_customer_timeline

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


class TimelineEventOut(BaseModel):
    kind: str
    timestamp: str
    title: str
    subtitle: str | None
    amount: float | None


@router.get("/{customer_id}/timeline", response_model=List[TimelineEventOut])
def customer_timeline(
    customer_id: int,
    limit: int = Query(30, ge=1, le=100),
    _: AuthPrincipal = Depends(require_permission(SALES_READ)),
    ctx: TenantContext = Depends(get_tenant_ctx),
    db: Session = Depends(get_db),
):
    events = get_customer_timeline(
        db, tenant_id=ctx.tenant_id, customer_id=customer_id, limit=limit
    )
    return [
        TimelineEventOut(
            kind=e.kind,
            timestamp=e.timestamp.isoformat(),
            title=e.title,
            subtitle=e.subtitle,
            amount=e.amount,
        )
        for e in events
    ]
