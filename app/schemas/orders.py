from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ─── Customer Order ───────────────────────────────────────────────────────────

class CustomerOrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(gt=0)
    tax_rate: Optional[Decimal] = Field(default=None, ge=0, le=100)


class CustomerOrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    tax_rate: Decimal
    line_total: Decimal
    tax_amount: Decimal


class CustomerOrderCreate(BaseModel):
    order_no: str = Field(min_length=1, max_length=64)
    order_date: date
    customer_id: Optional[int] = None
    customer_name: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = None
    items: List[CustomerOrderItemCreate] = Field(min_length=1)


class CustomerOrderUpdate(BaseModel):
    order_no: Optional[str] = Field(default=None, min_length=1, max_length=64)
    order_date: Optional[date] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(draft|confirmed|shipped|invoiced|cancelled)$")


class CustomerOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_no: str
    order_date: date
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: str
    notes: Optional[str] = None
    total_amount: Decimal
    tax_total: Decimal
    created_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    items: List[CustomerOrderItemOut] = []


# ─── Delivery Note ────────────────────────────────────────────────────────────

class DeliveryNoteItemCreate(BaseModel):
    order_item_id: Optional[int] = None
    product_id: int
    quantity: int = Field(gt=0)


class DeliveryNoteItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    order_item_id: Optional[int] = None
    quantity: int


class DeliveryNoteCreate(BaseModel):
    delivery_no: str = Field(min_length=1, max_length=64)
    delivery_date: date
    notes: Optional[str] = None
    items: List[DeliveryNoteItemCreate] = Field(min_length=1)


class DeliveryNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    delivery_no: str
    delivery_date: date
    status: str
    notes: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_at: datetime
    items: List[DeliveryNoteItemOut] = []


# ─── Invoice ──────────────────────────────────────────────────────────────────

class InvoicePrintItem(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    unit_price: Decimal
    tax_rate: Decimal
    line_total: Decimal
    tax_amount: Decimal


class InvoicePrintData(BaseModel):
    invoice_id: int
    invoice_no: str
    invoice_date: date
    order_id: int
    order_no: str
    order_date: date
    customer_name: Optional[str] = None
    notes: Optional[str] = None
    subtotal: Decimal
    tax_total: Decimal
    total_amount: Decimal
    items: List[InvoicePrintItem]
    # Seller (tenant company profile)
    company_name: str
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_tax_number: Optional[str] = None
    company_logo_url: Optional[str] = None
    currency: str = "TRY"


class InvoiceCreate(BaseModel):
    invoice_no: str = Field(min_length=1, max_length=64)
    invoice_date: date
    notes: Optional[str] = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    delivery_note_id: Optional[int] = None
    invoice_no: str
    invoice_date: date
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    total_amount: Decimal
    tax_total: Decimal
    status: str
    notes: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
