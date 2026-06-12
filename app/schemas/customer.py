from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=64)
    address: Optional[str] = Field(None, max_length=1000)
    customer_type: Literal["B2B", "B2C"] = "B2B"
    notes: Optional[str] = Field(None, max_length=2000)


class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=64)
    address: Optional[str] = Field(None, max_length=1000)
    customer_type: Optional[Literal["B2B", "B2C"]] = None
    notes: Optional[str] = Field(None, max_length=2000)


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    customer_type: str
    notes: Optional[str] = None
    created_at: datetime
