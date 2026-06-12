"""Cari Hesap (Account Receivable) routes."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import AuthPrincipal, TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import NotFoundException
from app.core.permissions import ACCOUNTS_READ, ACCOUNTS_WRITE
from app.models.customer import Customer
from app.models.customer_order import CustomerOrder
from app.models.customer_order import CustomerOrderItem
from app.models.invoice import Invoice
from app.models.product import Product
from app.models.sales import SalesItem, SalesRecord
from app.schemas.accounts import CustomerBalanceOut, PaymentCreate, StatementOut, AccountMovementOut
from app.services.accounts_service import accounts_service
from app.services.cashbook_service import cashbook_service

router = APIRouter()


@router.get("/customers", response_model=list[CustomerBalanceOut])
def list_customer_balances(
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: AuthPrincipal = Depends(require_permission(ACCOUNTS_READ)),
    db: Session = Depends(get_db),
):
    return accounts_service.list_balances(db, ctx.tenant_id)


@router.get("/customers/{customer_id}/balance", response_model=CustomerBalanceOut)
def get_customer_balance(
    customer_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: AuthPrincipal = Depends(require_permission(ACCOUNTS_READ)),
    db: Session = Depends(get_db),
):
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == ctx.tenant_id)
    )
    if customer is None:
        raise NotFoundException("Customer not found.", code="CUSTOMER_NOT_FOUND")
    balance = accounts_service.customer_balance(db, ctx.tenant_id, customer_id)
    return CustomerBalanceOut(customer_id=customer_id, customer_name=customer.name, balance=balance)


@router.get("/customers/{customer_id}/statement", response_model=StatementOut)
def get_customer_statement(
    customer_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: AuthPrincipal = Depends(require_permission(ACCOUNTS_READ)),
    db: Session = Depends(get_db),
):
    return accounts_service.customer_statement(
        db, ctx.tenant_id, customer_id, start_date=start_date, end_date=end_date
    )


@router.post(
    "/customers/{customer_id}/payments",
    response_model=AccountMovementOut,
    status_code=status.HTTP_201_CREATED,
)
def record_payment(
    customer_id: int,
    payload: PaymentCreate,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: AuthPrincipal = Depends(require_permission(ACCOUNTS_WRITE)),
    db: Session = Depends(get_db),
):
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == ctx.tenant_id)
    )
    if customer is None:
        raise NotFoundException("Customer not found.", code="CUSTOMER_NOT_FOUND")

    movement = accounts_service.add_payment(
        db,
        tenant_id=ctx.tenant_id,
        customer_id=customer_id,
        amount=payload.amount,
        description=payload.description,
        movement_date=payload.movement_date,
    )

    # ── Finance P&L: Tahsilat anında SalesRecord oluştur (cash basis) ──────────
    # invoice_no verilmişse o faturanın kalemlerini kullanarak COGS korunur.
    order_items: list[CustomerOrderItem] = []
    invoice_ref: Optional[str] = payload.invoice_no

    if payload.invoice_no:
        invoice = db.scalar(
            select(Invoice).where(
                Invoice.invoice_no == payload.invoice_no,
                Invoice.tenant_id == ctx.tenant_id,
            )
        )
        if invoice:
            order = db.scalar(
                select(CustomerOrder).where(
                    CustomerOrder.id == invoice.order_id,
                    CustomerOrder.tenant_id == ctx.tenant_id,
                )
            )
            if order:
                order_items = list(
                    db.scalars(
                        select(CustomerOrderItem).where(CustomerOrderItem.order_id == order.id)
                    ).all()
                )

    record_no = f"PAY-{payload.movement_date.strftime('%Y%m%d')}-{customer_id}"
    if invoice_ref:
        record_no = f"PAY-{invoice_ref}"

    sales_record = SalesRecord(
        tenant_id=ctx.tenant_id,
        record_no=record_no,
        sale_date=payload.movement_date,
        customer_id=customer_id,
        customer_name=customer.name,
        total_amount=payload.amount,
        payment_type="nakit",
        created_by_user_id=None,
    )
    db.add(sales_record)
    db.flush()

    if order_items:
        # Orantılı dağılım: ödeme tutarı fatura tutarından farklıysa kalemleri oranla
        invoice_total = sum(it.line_total for it in order_items)
        ratio = Decimal(str(payload.amount)) / invoice_total if invoice_total else Decimal("1")
        for it in order_items:
            product = db.scalar(
                select(Product).where(Product.id == it.product_id, Product.tenant_id == ctx.tenant_id)
            )
            cost_snapshot = (product.cost_price or Decimal("0")) if product else Decimal("0")
            db.add(SalesItem(
                tenant_id=ctx.tenant_id,
                sales_record_id=sales_record.id,
                product_id=it.product_id,
                quantity=it.quantity,
                unit_price=it.unit_price,
                line_total=(it.line_total * ratio).quantize(Decimal("0.01")),
                tax_rate=it.tax_rate,
                tax_amount=(it.tax_amount * ratio).quantize(Decimal("0.01")),
                cost_price_snapshot=cost_snapshot,
            ))

    # ── Cashbook: nakit girişi ──────────────────────────────────────────────────
    cashbook_service.auto_entry_from_sale(
        db,
        tenant_id=ctx.tenant_id,
        amount=Decimal(str(payload.amount)),
        description=f"Tahsilat — {customer.name}" + (f" — {payload.description}" if payload.description else ""),
        reference=invoice_ref,
        transaction_date=payload.movement_date,
    )

    db.commit()
    db.refresh(movement)
    return movement
