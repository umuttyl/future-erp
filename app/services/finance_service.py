from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.sales import SalesItem, SalesRecord


def _default_range(
    start_date: Optional[date], end_date: Optional[date], days: int = 90
) -> tuple[date, date]:
    today = date.today()
    end = end_date or today
    start = start_date or (end - timedelta(days=days))
    return start, end


class FinanceService:
    def summary(
        self,
        db: Session,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> Dict[str, Any]:
        start, end = _default_range(start_date, end_date)

        revenue_stmt = (
            select(
                func.coalesce(func.sum(SalesItem.line_total), 0),
                func.coalesce(func.sum(SalesItem.quantity), 0),
                func.count(func.distinct(SalesRecord.id)),
                func.count(func.distinct(SalesRecord.customer_name)),
            )
            .join(SalesItem, SalesItem.sales_record_id == SalesRecord.id)
            .where(SalesRecord.sale_date >= start)
            .where(SalesRecord.sale_date <= end)
        )
        revenue, qty, order_count, customer_count = db.execute(revenue_stmt).one()

        cogs_stmt = (
            select(
                func.coalesce(
                    func.sum(SalesItem.quantity * Product.cost_price),
                    0,
                )
            )
            .join(Product, Product.id == SalesItem.product_id)
            .join(SalesRecord, SalesRecord.id == SalesItem.sales_record_id)
            .where(SalesRecord.sale_date >= start)
            .where(SalesRecord.sale_date <= end)
        )
        cogs = float(db.execute(cogs_stmt).scalar_one() or 0)

        revenue_f = float(revenue or 0)
        gross_profit = revenue_f - cogs
        margin = (gross_profit / revenue_f * 100.0) if revenue_f > 0 else 0.0
        aov = (revenue_f / order_count) if order_count else 0.0

        inventory_value_stmt = select(
            func.coalesce(func.sum(Product.stock_quantity * Product.unit_price), 0)
        )
        inventory_value = float(db.execute(inventory_value_stmt).scalar_one() or 0)

        return {
            "start_date": start,
            "end_date": end,
            "revenue": round(revenue_f, 2),
            "cogs": round(cogs, 2),
            "gross_profit": round(gross_profit, 2),
            "margin_pct": round(margin, 2),
            "total_quantity": int(qty or 0),
            "order_count": int(order_count or 0),
            "customer_count": int(customer_count or 0),
            "avg_order_value": round(aov, 2),
            "inventory_value": round(inventory_value, 2),
        }

    def monthly_revenue(
        self,
        db: Session,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> List[Dict[str, Any]]:
        start, end = _default_range(start_date, end_date, days=365)

        # SQLite + Postgres uyumlu: tarihi YYYY-MM formatına çevir
        month_expr = func.strftime("%Y-%m", SalesRecord.sale_date)
        stmt = (
            select(
                month_expr.label("month"),
                func.coalesce(func.sum(SalesItem.line_total), 0).label("revenue"),
                func.coalesce(func.sum(SalesItem.quantity), 0).label("quantity"),
                func.count(func.distinct(SalesRecord.id)).label("orders"),
            )
            .join(SalesItem, SalesItem.sales_record_id == SalesRecord.id)
            .where(SalesRecord.sale_date >= start)
            .where(SalesRecord.sale_date <= end)
            .group_by(month_expr)
            .order_by(month_expr.asc())
        )
        rows = db.execute(stmt).all()
        return [
            {
                "month": r.month,
                "revenue": float(r.revenue or 0),
                "quantity": int(r.quantity or 0),
                "orders": int(r.orders or 0),
            }
            for r in rows
        ]

    def top_customers(
        self,
        db: Session,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        start, end = _default_range(start_date, end_date)

        stmt = (
            select(
                SalesRecord.customer_name.label("customer"),
                func.coalesce(func.sum(SalesItem.line_total), 0).label("revenue"),
                func.count(func.distinct(SalesRecord.id)).label("orders"),
            )
            .join(SalesItem, SalesItem.sales_record_id == SalesRecord.id)
            .where(SalesRecord.sale_date >= start)
            .where(SalesRecord.sale_date <= end)
            .where(SalesRecord.customer_name.is_not(None))
            .group_by(SalesRecord.customer_name)
            .order_by(func.sum(SalesItem.line_total).desc())
            .limit(limit)
        )
        rows = db.execute(stmt).all()
        return [
            {
                "customer": r.customer,
                "revenue": float(r.revenue or 0),
                "orders": int(r.orders or 0),
            }
            for r in rows
        ]

    def top_products(
        self,
        db: Session,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        start, end = _default_range(start_date, end_date)

        stmt = (
            select(
                Product.id.label("id"),
                Product.sku.label("sku"),
                Product.name.label("name"),
                func.coalesce(func.sum(SalesItem.quantity), 0).label("quantity"),
                func.coalesce(func.sum(SalesItem.line_total), 0).label("revenue"),
            )
            .join(SalesItem, SalesItem.product_id == Product.id)
            .join(SalesRecord, SalesRecord.id == SalesItem.sales_record_id)
            .where(SalesRecord.sale_date >= start)
            .where(SalesRecord.sale_date <= end)
            .group_by(Product.id, Product.sku, Product.name)
            .order_by(func.sum(SalesItem.line_total).desc())
            .limit(limit)
        )
        rows = db.execute(stmt).all()
        return [
            {
                "id": int(r.id),
                "sku": r.sku,
                "name": r.name,
                "quantity": int(r.quantity or 0),
                "revenue": float(r.revenue or 0),
            }
            for r in rows
        ]


finance_service = FinanceService()
