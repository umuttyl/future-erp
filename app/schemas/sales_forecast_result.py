from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SalesForecastResultCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_name: str = Field(min_length=1, max_length=128)
    scope: str = Field(default="global", max_length=64)
    product_id: Optional[int] = None
    forecast_start: date
    horizon_days: int = Field(gt=0)
    result_payload: dict


class SalesForecastResultOut(SalesForecastResultCreate):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: int
    created_at: datetime

