from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.schemas.product import ProductCreate, ProductUpdate, StockAdjustRequest
from app.services._base import TenantScopedService


class ProductsService(TenantScopedService[Product]):
    model = Product

    def list(self, db: Session, tenant_id: int, skip: int = 0, limit: int = 200) -> List[Product]:
        stmt = self._scoped(tenant_id).order_by(Product.id.desc()).offset(skip).limit(limit)
        return list(db.scalars(stmt).all())

    def get(self, db: Session, tenant_id: int, product_id: int) -> Optional[Product]:
        return self._get_one(db, tenant_id, product_id)

    def create(self, db: Session, tenant_id: int, data: ProductCreate) -> Product:
        obj = Product(
            tenant_id=tenant_id,
            sku=data.sku,
            name=data.name,
            category=data.category,
            unit_price=data.unit_price,
            cost_price=data.cost_price,
            stock_quantity=data.stock_quantity,
            reorder_level=data.reorder_level,
        )
        db.add(obj)
        db.flush()  # obj.id atanır, henüz commit edilmez
        if obj.stock_quantity > 0:
            db.add(
                StockMovement(
                    tenant_id=tenant_id,
                    product_id=obj.id,
                    movement_type="in",
                    change=obj.stock_quantity,
                    balance_after=obj.stock_quantity,
                    reference="initial",
                    note="Ürün oluşturulurken girilen başlangıç stoğu",
                )
            )
        db.commit()  # tek atomik commit
        db.refresh(obj)
        return obj

    def update(self, db: Session, tenant_id: int, product: Product, data: ProductUpdate) -> Product:
        if product.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        payload = data.model_dump(exclude_unset=True)
        for k, v in payload.items():
            setattr(product, k, v)
        db.add(product)
        db.commit()
        db.refresh(product)
        return product

    def delete(self, db: Session, tenant_id: int, product: Product) -> None:
        if product.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        db.delete(product)
        db.commit()

    def adjust_stock(
        self,
        db: Session,
        tenant_id: int,
        product: Product,
        data: StockAdjustRequest,
    ) -> tuple[Product, StockMovement]:
        if product.tenant_id != tenant_id:
            raise ValueError("tenant mismatch")
        new_balance = (product.stock_quantity or 0) + data.change
        if new_balance < 0:
            raise ValueError(
                f"Yetersiz stok: mevcut {product.stock_quantity}, talep edilen değişim {data.change}"
            )

        product.stock_quantity = new_balance
        movement = StockMovement(
            tenant_id=tenant_id,
            product_id=product.id,
            movement_type=data.movement_type,
            change=data.change,
            balance_after=new_balance,
            reference=data.reference,
            note=data.note,
        )
        db.add(product)
        db.add(movement)
        db.commit()
        db.refresh(product)
        db.refresh(movement)
        return product, movement

    def list_movements(
        self,
        db: Session,
        tenant_id: int,
        *,
        product_id: Optional[int] = None,
        limit: int = 200,
    ) -> List[StockMovement]:
        stmt = select(StockMovement).where(StockMovement.tenant_id == tenant_id).order_by(StockMovement.id.desc()).limit(limit)
        if product_id is not None:
            stmt = stmt.where(StockMovement.product_id == product_id)
        return list(db.scalars(stmt).all())


products_service = ProductsService()
