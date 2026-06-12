from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class StockCountItemIn(BaseModel):
    product_id: int
    counted_qty: int = Field(ge=0)


class StockCountCreate(BaseModel):
    count_no: str = Field(min_length=1, max_length=64)
    count_date: date
    notes: Optional[str] = None
    items: List[StockCountItemIn] = Field(min_length=1)


class StockCountItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    system_qty: int
    counted_qty: int
    difference: int


class StockCountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    count_no: str
    count_date: date
    status: str
    notes: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    items: List[StockCountItemOut] = []
