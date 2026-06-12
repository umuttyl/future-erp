from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SalesItemBase(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(gt=0)


class SalesItemCreate(SalesItemBase):
    tax_rate: Optional[Decimal] = Field(None, ge=0, le=100, description="KDV oranı %; None ise ürün varsayılanı kullanılır")


class SalesItemOut(SalesItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sales_record_id: int
    line_total: Decimal
    tax_rate: Decimal
    tax_amount: Decimal


PAYMENT_TYPES = ("nakit", "kredi", "banka_havalesi")


class SalesRecordBase(BaseModel):
    record_no: str = Field(min_length=1, max_length=64)
    sale_date: date
    customer_id: Optional[int] = None
    customer_name: Optional[str] = Field(default=None, max_length=255)
    payment_type: str = Field(default="nakit", pattern="^(nakit|kredi|banka_havalesi)$")


class SalesRecordCreate(SalesRecordBase):
    items: List[SalesItemCreate] = Field(default_factory=list)


class SalesRecordOut(SalesRecordBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    total_amount: Decimal
    created_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    items: List[SalesItemOut] = Field(default_factory=list)

    @property
    def tax_total(self) -> Decimal:
        return sum((i.tax_amount for i in self.items), Decimal("0"))


class DailySalesPoint(BaseModel):
    date: date
    quantity: int
    revenue: float

