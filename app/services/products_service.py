from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.stock_movement import StockMovement
from app.schemas.product import ProductCreate, ProductUpdate, StockAdjustRequest


class ProductsService:
    def list(self, db: Session) -> List[Product]:
        return list(db.scalars(select(Product).order_by(Product.id.desc())).all())

    def get(self, db: Session, product_id: int) -> Optional[Product]:
        return db.get(Product, product_id)

    def create(self, db: Session, data: ProductCreate) -> Product:
        obj = Product(
            sku=data.sku,
            name=data.name,
            category=data.category,
            unit_price=data.unit_price,
            cost_price=data.cost_price,
            stock_quantity=data.stock_quantity,
            reorder_level=data.reorder_level,
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)

        if obj.stock_quantity > 0:
            db.add(
                StockMovement(
                    product_id=obj.id,
                    movement_type="in",
                    change=obj.stock_quantity,
                    balance_after=obj.stock_quantity,
                    reference="initial",
                    note="Ürün oluşturulurken girilen başlangıç stoğu",
                )
            )
            db.commit()

        return obj

    def update(self, db: Session, product: Product, data: ProductUpdate) -> Product:
        payload = data.model_dump(exclude_unset=True)
        for k, v in payload.items():
            setattr(product, k, v)
        db.add(product)
        db.commit()
        db.refresh(product)
        return product

    def delete(self, db: Session, product: Product) -> None:
        db.delete(product)
        db.commit()

    def adjust_stock(
        self,
        db: Session,
        product: Product,
        data: StockAdjustRequest,
    ) -> tuple[Product, StockMovement]:
        new_balance = (product.stock_quantity or 0) + data.change
        if new_balance < 0:
            raise ValueError(
                f"Yetersiz stok: mevcut {product.stock_quantity}, talep edilen değişim {data.change}"
            )

        product.stock_quantity = new_balance
        movement = StockMovement(
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
        *,
        product_id: Optional[int] = None,
        limit: int = 200,
    ) -> List[StockMovement]:
        stmt = select(StockMovement).order_by(StockMovement.id.desc()).limit(limit)
        if product_id is not None:
            stmt = stmt.where(StockMovement.product_id == product_id)
        return list(db.scalars(stmt).all())


products_service = ProductsService()
