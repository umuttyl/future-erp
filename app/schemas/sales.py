from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SalesItemBase(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(gt=0)


class SalesItemCreate(SalesItemBase):
    pass


class SalesItemOut(SalesItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sales_record_id: int
    line_total: Decimal


class SalesRecordBase(BaseModel):
    record_no: str = Field(min_length=1, max_length=64)
    sale_date: date
    customer_name: Optional[str] = Field(default=None, max_length=255)


class SalesRecordCreate(SalesRecordBase):
    items: List[SalesItemCreate] = Field(default_factory=list)


class SalesRecordOut(SalesRecordBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    total_amount: Decimal
    created_at: datetime
    updated_at: datetime
    items: List[SalesItemOut] = Field(default_factory=list)

