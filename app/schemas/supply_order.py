from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SupplyOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    quantity: int
    status: str
    created_at: datetime


class AutoDraftSupplyResponse(BaseModel):
    """POST /inventory/{product_id}/auto-draft yanıtı."""

    message: str
    order: SupplyOrderOut
    stock_before: int = Field(description="Taslak oluşturulurken ürün stoğu")
    critical_threshold_used: int = Field(description="Kritik eşik (reorder_level veya varsayılan 50)")
    target_stock: int = Field(description="Hedef stok seviyesi (sabit)")
    quantity_from_target_gap: int = Field(description="Hedef stok - mevcut stok (taban öneri)")
    prophet_demand_sum_30d: Optional[int] = Field(
        default=None,
        description="Ürün için Prophet günlük tahminlerinin ilk 30 gün toplamı (varsa)",
    )
