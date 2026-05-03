from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.product import Product
from app.models.sales import SalesItem, SalesRecord
from app.models.stock_movement import StockMovement
from app.schemas.sales import SalesRecordCreate


class SalesService:
    def list_records(
        self,
        db: Session,
        tenant_id: int,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        customer: Optional[str] = None,
        search: Optional[str] = None,
        min_amount: Optional[float] = None,
        limit: int = 500,
    ) -> List[SalesRecord]:
        stmt = (
            select(SalesRecord)
            .options(selectinload(SalesRecord.items))
            .where(SalesRecord.tenant_id == tenant_id)
            .order_by(SalesRecord.sale_date.desc(), SalesRecord.id.desc())
            .limit(limit)
        )
        if start_date is not None:
            stmt = stmt.where(SalesRecord.sale_date >= start_date)
        if end_date is not None:
            stmt = stmt.where(SalesRecord.sale_date <= end_date)
        if customer:
            stmt = stmt.where(SalesRecord.customer_name.ilike(f"%{customer}%"))
        if search:
            like = f"%{search}%"
            stmt = stmt.where(
                (SalesRecord.record_no.ilike(like))
                | (SalesRecord.customer_name.ilike(like))
            )
        if min_amount is not None:
            stmt = stmt.where(SalesRecord.total_amount >= Decimal(str(min_amount)))
        return list(db.scalars(stmt).all())

    def get_record(self, db: Session, tenant_id: int, record_id: int) -> Optional[SalesRecord]:
        stmt = (
            select(SalesRecord)
            .options(selectinload(SalesRecord.items))
            .where(SalesRecord.id == record_id, SalesRecord.tenant_id == tenant_id)
        )
        return db.scalar(stmt)

    def create_record(self, db: Session, tenant_id: int, data: SalesRecordCreate) -> SalesRecord:
        record = SalesRecord(
            tenant_id=tenant_id,
            record_no=data.record_no,
            sale_date=data.sale_date,
            customer_name=data.customer_name,
            total_amount=Decimal("0"),
        )

        total = Decimal("0")
        items: List[SalesItem] = []
        touched_products: list[Product] = []

        for i in data.items:
            p_stmt = select(Product).where(Product.id == i.product_id, Product.tenant_id == tenant_id)
            product = db.scalar(p_stmt)
            if not product:
                raise ValueError(f"Product not found: {i.product_id}")
            if (product.stock_quantity or 0) < i.quantity:
                raise ValueError(
                    f"Yetersiz stok: {product.name} (mevcut {product.stock_quantity}, istenen {i.quantity})"
                )

            line_total = (Decimal(i.quantity) * i.unit_price).quantize(Decimal("0.01"))
            total += line_total
            items.append(
                SalesItem(
                    tenant_id=tenant_id,
                    product_id=i.product_id,
                    quantity=i.quantity,
                    unit_price=i.unit_price,
                    line_total=line_total,
                )
            )

            product.stock_quantity = product.stock_quantity - i.quantity
            touched_products.append(product)

        record.total_amount = total
        record.items = items

        db.add(record)
        for p in touched_products:
            db.add(p)
        db.commit()
        db.refresh(record)

        for it, p in zip(record.items, touched_products):
            db.add(
                StockMovement(
                    tenant_id=tenant_id,
                    product_id=p.id,
                    movement_type="out",
                    change=-int(it.quantity),
                    balance_after=p.stock_quantity,
                    reference=record.record_no,
                    note=f"Satış {record.record_no}",
                )
            )
        db.commit()

        return self.get_record(db, tenant_id, record.id) or record


sales_service = SalesService()
