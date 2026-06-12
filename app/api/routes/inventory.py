from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import NotFoundException, ValidationException
from app.core.permissions import CATALOG_PRODUCT_READ, STOCK_ADJUST
from app.models.expense import Expense
from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.models.supplier import Supplier
from app.models.supply_order import SupplyOrder
from app.schemas.supply_order import AutoDraftSupplyResponse, SupplyOrderOut
from app.services.cashbook_service import cashbook_service
from app.services.inventory_service import inventory_service

router = APIRouter()

_VALID_STATUSES = {"Draft", "Approved", "Received", "Cancelled"}

# Allowed transitions: which statuses can each status move to
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "Draft":     {"Approved", "Cancelled"},
    "Approved":  {"Received", "Cancelled"},
    "Received":  set(),   # terminal
    "Cancelled": set(),   # terminal
}


class OrderStatusUpdate(BaseModel):
    status: str


class SupplyOrderCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, description="Must be at least 1")
    supplier_id: Optional[int] = None
    unit_cost: Optional[Decimal] = Field(default=None, ge=0, description="Birim alış fiyatı. Girilmezse ürünün maliyet fiyatı kullanılır.")


def _enrich_order(order: SupplyOrder, products: dict, suppliers: dict) -> SupplyOrderOut:
    out = SupplyOrderOut.model_validate(order)
    out.product_name = products.get(order.product_id)
    if order.supplier_id:
        out.supplier_name = suppliers.get(order.supplier_id)
    if order.unit_cost is not None:
        out.total_cost = order.unit_cost * order.quantity
    return out


@router.post("/orders", response_model=SupplyOrderOut, status_code=status.HTTP_201_CREATED)
def create_supply_order(
    payload: SupplyOrderCreate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(STOCK_ADJUST)),
    db: Session = Depends(get_db),
):
    """Manually create a Draft supply order for any product."""
    product = db.scalar(
        select(Product).where(Product.id == payload.product_id, Product.tenant_id == ctx.tenant_id)
    )
    if not product:
        raise NotFoundException("Product not found.", code="PRODUCT_NOT_FOUND")

    if payload.supplier_id:
        supplier_exists = db.scalar(
            select(Supplier.id).where(
                Supplier.id == payload.supplier_id,
                Supplier.tenant_id == ctx.tenant_id,
                Supplier.deleted_at.is_(None),
            )
        )
        if not supplier_exists:
            raise NotFoundException("Supplier not found.", code="SUPPLIER_NOT_FOUND")

    # Birim alış fiyatı: girilmezse ürünün cost_price'ı kullanılır
    unit_cost = payload.unit_cost
    if unit_cost is None and product.cost_price:
        unit_cost = product.cost_price

    order = SupplyOrder(
        tenant_id=ctx.tenant_id,
        product_id=payload.product_id,
        supplier_id=payload.supplier_id,
        quantity=payload.quantity,
        unit_cost=unit_cost,
        status="Draft",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    supplier_name: Optional[str] = None
    if payload.supplier_id:
        sup = db.scalar(select(Supplier).where(Supplier.id == payload.supplier_id))
        supplier_name = sup.name if sup else None

    out = SupplyOrderOut.model_validate(order)
    out.product_name = product.name
    out.supplier_name = supplier_name
    if order.unit_cost is not None:
        out.total_cost = order.unit_cost * order.quantity
    return out


@router.get("/orders", response_model=List[SupplyOrderOut])
def list_supply_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(CATALOG_PRODUCT_READ)),
    db: Session = Depends(get_db),
):
    orders = db.scalars(
        select(SupplyOrder)
        .where(SupplyOrder.tenant_id == ctx.tenant_id)
        .order_by(SupplyOrder.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    product_ids = {o.product_id for o in orders}
    products = {
        p.id: p.name
        for p in db.scalars(
            select(Product).where(
                Product.tenant_id == ctx.tenant_id,
                Product.id.in_(product_ids),
            )
        ).all()
    }

    supplier_ids = {o.supplier_id for o in orders if o.supplier_id}
    suppliers: dict[int, str] = {}
    if supplier_ids:
        suppliers = {
            s.id: s.name
            for s in db.scalars(
                select(Supplier).where(
                    Supplier.tenant_id == ctx.tenant_id,
                    Supplier.id.in_(supplier_ids),
                )
            ).all()
        }

    return [_enrich_order(o, products, suppliers) for o in orders]


@router.patch("/orders/{order_id}/status", response_model=SupplyOrderOut)
def update_supply_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(STOCK_ADJUST)),
    db: Session = Depends(get_db),
):
    """Supply order durumunu günceller. Geçerli geçişler: Draft→Approved/Cancelled, Approved→Received/Cancelled."""
    if payload.status not in _VALID_STATUSES:
        raise ValidationException(
            f"Invalid status. Accepted: {sorted(_VALID_STATUSES)}",
            code="INVALID_STATUS",
        )
    order = db.scalar(
        select(SupplyOrder).where(
            SupplyOrder.id == order_id,
            SupplyOrder.tenant_id == ctx.tenant_id,
        )
    )
    if not order:
        raise NotFoundException("Order not found.", code="ORDER_NOT_FOUND")

    prev_status = order.status
    allowed = _ALLOWED_TRANSITIONS.get(prev_status, set())
    if payload.status not in allowed:
        raise ValidationException(
            f"Cannot transition from '{prev_status}' to '{payload.status}'.",
            code="INVALID_TRANSITION",
        )

    order.status = payload.status

    # Only when goods physically arrive (Approved → Received) do we update stock
    if payload.status == "Received" and prev_status == "Approved":
        product = db.scalar(
            select(Product).where(
                Product.id == order.product_id,
                Product.tenant_id == ctx.tenant_id,
            )
        )
        if product:
            new_stock = int(product.stock_quantity or 0) + order.quantity
            product.stock_quantity = new_stock
            db.add(product)
            db.add(StockMovement(
                tenant_id=ctx.tenant_id,
                product_id=product.id,
                movement_type="in",
                change=order.quantity,
                balance_after=new_stock,
                reference=f"Supply Order #{order.id}",
                note="Supply order received",
            ))
            # Finance: P&L expense + cashbook otomatik gider
            # Öncelik: order.unit_cost → product.cost_price → 0
            unit_cost = order.unit_cost if order.unit_cost is not None else Decimal(str(product.cost_price or 0))
            if unit_cost > 0:
                total_cost = unit_cost * order.quantity
                sup = db.scalar(select(Supplier).where(Supplier.id == order.supplier_id)) if order.supplier_id else None
                vendor = sup.name if sup else None
                payment_terms = sup.payment_terms if sup else None
                description_detail = f" | {payment_terms}" if payment_terms else ""
                db.add(Expense(
                    tenant_id=ctx.tenant_id,
                    category="inventory",
                    description=f"{product.name} ×{order.quantity}{description_detail}",
                    amount=float(total_cost),
                    currency="TRY",
                    expense_date=date.today(),
                    vendor=vendor,
                    receipt_ref=f"Supply Order #{order.id}",
                ))
                cashbook_note = f"Tedarik alımı — {product.name} ×{order.quantity}"
                if vendor:
                    cashbook_note += f" ({vendor})"
                cashbook_service.auto_entry_for_expense(
                    db,
                    tenant_id=ctx.tenant_id,
                    amount=total_cost,
                    description=cashbook_note,
                    reference=f"Supply Order #{order.id}",
                    transaction_date=date.today(),
                )

    db.add(order)
    db.commit()
    db.refresh(order)

    prod_name = db.scalar(
        select(Product.name).where(Product.id == order.product_id, Product.tenant_id == ctx.tenant_id)
    ) or ""
    products = {order.product_id: prod_name}
    suppliers_map: dict[int, str] = {}
    if order.supplier_id and order.supplier:
        suppliers_map[order.supplier_id] = order.supplier.name
    return _enrich_order(order, products, suppliers_map)


@router.post(
    "/{product_id}/auto-draft",
    response_model=AutoDraftSupplyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_auto_draft_supply_order(
    product_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(STOCK_ADJUST)),
    db: Session = Depends(get_db),
    is_ai_override: bool = Query(
        False,
        description=(
            "True ise kritik stok kontrolü atlanır; AI bildiriminden gelen proaktif taslak "
            "(gelecek talep öngörüsü) olarak işlenir."
        ),
    ),
):
    """Stok kritikteyse hedef stok (ve varsa Prophet talebi) ile taslak tedarik satırı oluşturur."""
    try:
        order, meta = inventory_service.auto_draft_supply_order(
            db, ctx.tenant_id, product_id, is_ai_override=is_ai_override
        )
    except ValueError as e:
        code = str(e)
        if code == "PRODUCT_NOT_FOUND":
            raise NotFoundException("Product not found.", code="PRODUCT_NOT_FOUND") from e
        if code == "STOCK_NOT_CRITICAL":
            raise ValidationException(
                "Stock is not at critical threshold; draft order not created.",
                code="STOCK_NOT_CRITICAL",
            ) from e
        raise

    return AutoDraftSupplyResponse(
        message="Draft supply order created.",
        order=SupplyOrderOut.model_validate(order),
        stock_before=meta["stock_before"],
        critical_threshold_used=meta["critical_threshold_used"],
        target_stock=meta["target_stock"],
        quantity_from_target_gap=meta["quantity_from_target_gap"],
        prophet_demand_sum_30d=meta["prophet_demand_sum_30d"],
    )
