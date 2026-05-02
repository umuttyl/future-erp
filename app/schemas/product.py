from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ProductBase(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=128)
    unit_price: Decimal = Field(gt=0)
    cost_price: Decimal = Field(default=Decimal("0"), ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=0, ge=0)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    sku: Optional[str] = Field(default=None, min_length=1, max_length=64)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=128)
    unit_price: Optional[Decimal] = Field(default=None, gt=0)
    cost_price: Optional[Decimal] = Field(default=None, ge=0)
    reorder_level: Optional[int] = Field(default=None, ge=0)


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class StockAdjustRequest(BaseModel):
    change: int = Field(description="Delta stok miktarı (pozitif giriş, negatif çıkış)")
    movement_type: str = Field(default="adjust", pattern="^(in|out|adjust)$")
    reference: Optional[str] = Field(default=None, max_length=128)
    note: Optional[str] = Field(default=None, max_length=255)


class StockMovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    movement_type: str
    change: int
    balance_after: int
    reference: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
