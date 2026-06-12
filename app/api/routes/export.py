"""Data export endpoints — downloads tenant data as Excel."""
from __future__ import annotations

import io
from datetime import date
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.deps import AuthPrincipal, require_permission
from app.core.permissions import CATALOG_PRODUCT_READ, FINANCE_READ, SALES_READ
from app.models.account_movement import AccountMovement
from app.models.customer import Customer
from app.models.customer_order import CustomerOrder, CustomerOrderItem
from app.models.product import Product
from app.models.sales import SalesItem, SalesRecord

router = APIRouter()


def _xlsx_response(df: pd.DataFrame, filename: str) -> StreamingResponse:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Data")
    buf.seek(0)
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    return StreamingResponse(buf, headers=headers)


# ─── Sales ────────────────────────────────────────────────────────────────────

@router.get("/sales")
def export_sales(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    principal: AuthPrincipal = Depends(require_permission(SALES_READ)),
    db: Session = Depends(get_db),
):
    stmt = (
        select(SalesRecord)
        .options(selectinload(SalesRecord.items))
        .where(SalesRecord.tenant_id == principal.tenant_id)
        .order_by(SalesRecord.sale_date.desc())
    )
    if start_date:
        stmt = stmt.where(SalesRecord.sale_date >= start_date)
    if end_date:
        stmt = stmt.where(SalesRecord.sale_date <= end_date)
    records = db.scalars(stmt).all()

    rows = []
    for r in records:
        for item in r.items:
            rows.append({
                "Record No": r.record_no,
                "Date": r.sale_date,
                "Customer": r.customer_name or "",
                "Product ID": item.product_id,
                "Quantity": float(item.quantity),
                "Unit Price": float(item.unit_price),
                "Line Total": float(item.line_total),
                "VAT Rate": float(item.tax_rate),
                "VAT Amount": float(item.tax_amount),
                "Cost (Snapshot)": float(item.cost_price_snapshot),
            })
    if not rows:
        rows = [{"Record No": "", "Date": "", "Customer": "", "Product ID": "",
                 "Quantity": "", "Unit Price": "", "Line Total": "",
                 "VAT Rate": "", "VAT Amount": "", "Cost (Snapshot)": ""}]

    df = pd.DataFrame(rows)
    return _xlsx_response(df, "sales_report.xlsx")


# ─── Stock / Products ─────────────────────────────────────────────────────────

@router.get("/products")
def export_products(
    principal: AuthPrincipal = Depends(require_permission(CATALOG_PRODUCT_READ)),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Product)
        .where(Product.tenant_id == principal.tenant_id)
        .order_by(Product.name)
    )
    products = db.scalars(stmt).all()
    rows = [
        {
            "SKU": p.sku,
            "Product Name": p.name,
            "Category": p.category or "",
            "Stock": float(p.stock_quantity or 0),
            "Reorder Level": float(p.reorder_level or 0),
            "Unit Price": float(p.unit_price),
            "Cost Price": float(p.cost_price or 0),
            "VAT Rate": float(p.tax_rate or 0),
            "Active": "Yes" if p.deleted_at is None else "No",
        }
        for p in products
    ]
    df = pd.DataFrame(rows) if rows else pd.DataFrame()
    return _xlsx_response(df, "stock_report.xlsx")


# ─── Customers ────────────────────────────────────────────────────────────────

@router.get("/customers")
def export_customers(
    principal: AuthPrincipal = Depends(require_permission(SALES_READ)),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Customer)
        .where(Customer.tenant_id == principal.tenant_id, Customer.deleted_at.is_(None))
        .order_by(Customer.name)
    )
    customers = db.scalars(stmt).all()
    rows = [
        {
            "Customer Name": c.name,
            "Type": c.customer_type,
            "Email": c.email or "",
            "Phone": c.phone or "",
            "Address": c.address or "",
            "Notes": c.notes or "",
            "Created": c.created_at.date() if c.created_at else "",
        }
        for c in customers
    ]
    df = pd.DataFrame(rows) if rows else pd.DataFrame()
    return _xlsx_response(df, "customer_list.xlsx")


# ─── Account Movements ────────────────────────────────────────────────────────

@router.get("/accounts")
def export_accounts(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    principal: AuthPrincipal = Depends(require_permission(FINANCE_READ)),
    db: Session = Depends(get_db),
):
    stmt = (
        select(AccountMovement)
        .where(AccountMovement.tenant_id == principal.tenant_id)
        .order_by(AccountMovement.movement_date.desc())
    )
    if start_date:
        stmt = stmt.where(AccountMovement.movement_date >= start_date)
    if end_date:
        stmt = stmt.where(AccountMovement.movement_date <= end_date)
    movements = db.scalars(stmt).all()
    rows = [
        {
            "Date": m.movement_date,
            "Customer ID": m.customer_id or "",
            "Movement Type": m.movement_type,
            "Amount": float(m.amount),
            "Description": m.description or "",
            "Reference": m.reference or "",
        }
        for m in movements
    ]
    df = pd.DataFrame(rows) if rows else pd.DataFrame()
    return _xlsx_response(df, "account_movements.xlsx")


# ─── Orders ───────────────────────────────────────────────────────────────────

@router.get("/orders")
def export_orders(
    principal: AuthPrincipal = Depends(require_permission(SALES_READ)),
    db: Session = Depends(get_db),
):
    stmt = (
        select(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .where(CustomerOrder.tenant_id == principal.tenant_id)
        .order_by(CustomerOrder.order_date.desc())
    )
    orders = db.scalars(stmt).all()
    rows = []
    for o in orders:
        for item in o.items:
            rows.append({
                "Order No": o.order_no,
                "Date": o.order_date,
                "Customer": o.customer_name or "",
                "Status": o.status,
                "Product ID": item.product_id,
                "Quantity": float(item.quantity),
                "Unit Price": float(item.unit_price),
                "Line Total": float(item.line_total),
                "VAT Rate": float(item.tax_rate),
                "VAT Amount": float(item.tax_amount),
            })
    if not rows:
        rows = [{"Order No": "", "Date": "", "Customer": "", "Status": "",
                 "Product ID": "", "Quantity": "", "Unit Price": "",
                 "Line Total": "", "VAT Rate": "", "VAT Amount": ""}]
    df = pd.DataFrame(rows)
    return _xlsx_response(df, "orders_report.xlsx")
