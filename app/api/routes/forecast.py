from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.ai_engine.forecast import naive_daily_forecast
from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import ValidationException
from app.core.permissions import FORECAST_RUN
from app.schemas.sales_forecast_result import SalesForecastResultCreate, SalesForecastResultOut
from app.services.forecasting import run_prophet_forecast
from app.services.forecast_results_service import forecast_results_service

router = APIRouter()


class ForecastRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    forecast_start: date = Field(default_factory=date.today)
    horizon_days: int = Field(default=14, gt=0)
    base_value: float = Field(default=0.0)
    scope: str = Field(default="global", max_length=64)
    product_id: Optional[int] = None
    model_name: str = Field(default="naive", max_length=128)


class ProphetForecastRequest(BaseModel):
    product_id: Optional[int] = None
    horizon_days: int = Field(default=30, gt=0, le=365)


@router.post("/run", response_model=SalesForecastResultOut, status_code=status.HTTP_201_CREATED)
def run_forecast(
    payload: ForecastRequest,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(FORECAST_RUN)),
    db: Session = Depends(get_db),
):
    result_payload = naive_daily_forecast(
        start=payload.forecast_start,
        horizon_days=payload.horizon_days,
        base_value=payload.base_value,
    )

    to_save = SalesForecastResultCreate(
        model_name=payload.model_name,
        scope=payload.scope,
        product_id=payload.product_id,
        forecast_start=payload.forecast_start,
        horizon_days=payload.horizon_days,
        result_payload=result_payload,
    )
    return forecast_results_service.create(db, ctx.tenant_id, to_save)


@router.post("/prophet/run", response_model=SalesForecastResultOut, status_code=status.HTTP_201_CREATED)
def run_prophet(
    payload: ProphetForecastRequest,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(FORECAST_RUN)),
    db: Session = Depends(get_db),
):
    try:
        return run_prophet_forecast(
            db,
            tenant_id=ctx.tenant_id,
            horizon_days=payload.horizon_days,
            product_id=payload.product_id,
        )
    except ValueError as e:
        raise ValidationException(str(e), code="FORECAST_VALIDATION_FAILED") from e


@router.get("/results", response_model=list[SalesForecastResultOut])
def list_forecast_results(
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(FORECAST_RUN)),
    db: Session = Depends(get_db),
):
    return forecast_results_service.list(db, ctx.tenant_id)
