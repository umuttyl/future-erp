from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.product import (
    ProductCreate,
    ProductOut,
    ProductUpdate,
    StockAdjustRequest,
    StockMovementOut,
)
from app.services.products_service import products_service


router = APIRouter()


@router.get("", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    return products_service.list(db)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    return products_service.create(db, payload)


@router.get("/movements", response_model=List[StockMovementOut])
def list_stock_movements(
    product_id: Optional[int] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    return products_service.list_movements(db, product_id=product_id, limit=limit)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    obj = products_service.get(db, product_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Product not found")
    return obj


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    obj = products_service.get(db, product_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Product not found")
    return products_service.update(db, obj, payload)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    obj = products_service.get(db, product_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Product not found")
    products_service.delete(db, obj)
    return None


@router.post("/{product_id}/stock", response_model=ProductOut)
def adjust_stock(
    product_id: int,
    payload: StockAdjustRequest,
    db: Session = Depends(get_db),
):
    obj = products_service.get(db, product_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        product, _movement = products_service.adjust_stock(db, obj, payload)
        return product
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
