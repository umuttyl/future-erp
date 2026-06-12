from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.stock_count import StockCount, StockCountItem
from app.models.stock_movement import StockMovement
from app.schemas.stock_count import StockCountCreate


class StockCountService:

    def list(
        self,
        db: Session,
        tenant_id: int,
        skip: int = 0,
        limit: int = 50,
    ) -> List[StockCount]:
        stmt = (
            select(StockCount)
            .where(StockCount.tenant_id == tenant_id)
            .order_by(StockCount.id.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(db.scalars(stmt).all())

    def get(self, db: Session, tenant_id: int, count_id: int) -> Optional[StockCount]:
        return db.scalar(
            select(StockCount).where(
                StockCount.tenant_id == tenant_id, StockCount.id == count_id
            )
        )

    def create(
        self,
        db: Session,
        tenant_id: int,
        data: StockCountCreate,
        created_by_user_id: Optional[int] = None,
    ) -> StockCount:
        count = StockCount(
            tenant_id=tenant_id,
            count_no=data.count_no,
            count_date=data.count_date,
            notes=data.notes,
            status="draft",
            created_by_user_id=created_by_user_id,
        )
        db.add(count)
        db.flush()

        for i in data.items:
            product: Optional[Product] = db.scalar(
                select(Product).where(
                    Product.tenant_id == tenant_id, Product.id == i.product_id
                )
            )
            if product is None:
                raise ValueError(f"Ürün bulunamadı: {i.product_id}")

            db.add(StockCountItem(
                tenant_id=tenant_id,
                stock_count_id=count.id,
                product_id=i.product_id,
                system_qty=product.stock_quantity or 0,
                counted_qty=i.counted_qty,
                difference=i.counted_qty - (product.stock_quantity or 0),
            ))

        db.commit()
        db.refresh(count)
        return count

    def complete(
        self,
        db: Session,
        tenant_id: int,
        count: StockCount,
    ) -> StockCount:
        if count.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        if count.status != "draft":
            raise ValueError(f"Sayım tamamlanamaz, mevcut durum: {count.status}")

        for item in count.items:
            if item.difference == 0:
                continue

            product: Optional[Product] = db.scalar(
                select(Product).where(
                    Product.tenant_id == tenant_id, Product.id == item.product_id
                )
            )
            if product is None:
                continue

            product.stock_quantity = item.counted_qty
            db.add(StockMovement(
                tenant_id=tenant_id,
                product_id=item.product_id,
                movement_type="adjust",
                change=item.difference,
                balance_after=item.counted_qty,
                reference=count.count_no,
                note=f"Stok sayımı #{count.id}",
            ))

        count.status = "completed"
        count.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(count)
        return count

    def cancel(self, db: Session, tenant_id: int, count: StockCount) -> StockCount:
        if count.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        if count.status != "draft":
            raise ValueError(f"Sayım iptal edilemez, mevcut durum: {count.status}")
        count.status = "cancelled"
        db.commit()
        db.refresh(count)
        return count


stock_count_service = StockCountService()
