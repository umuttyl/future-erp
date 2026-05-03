from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional

import pandas as pd
from prophet import Prophet
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.sales_forecast_result import SalesForecastResult
from app.schemas.sales_forecast_result import SalesForecastResultCreate
from app.services.forecast_results_service import forecast_results_service


def _load_daily_demand(
    db: Session, *, tenant_id: int, product_id: Optional[int]
) -> pd.DataFrame:
    extra = ""
    params: Dict[str, Any] = {"tenant_id": tenant_id}
    if product_id is not None:
        extra = " AND si.product_id = :product_id"
        params["product_id"] = product_id

    stmt = text(
        f"""
        SELECT
          sr.sale_date AS ds,
          SUM(si.quantity) AS y
        FROM sales_records sr
        JOIN sales_items si ON si.sales_record_id = sr.id
        WHERE sr.tenant_id = :tenant_id AND si.tenant_id = :tenant_id
        {extra}
        GROUP BY sr.sale_date
        ORDER BY sr.sale_date
        """
    )

    with db.get_bind().connect() as conn:
        df = pd.read_sql_query(stmt, con=conn, params=params)
    if not df.empty:
        df["ds"] = pd.to_datetime(df["ds"])
        df["y"] = pd.to_numeric(df["y"])
    return df


def _confidence_from_interval(yhat: float, yhat_lower: float, yhat_upper: float) -> float:
    width = max(0.0, float(yhat_upper) - float(yhat_lower))
    scale = max(1.0, abs(float(yhat)))
    score = 1.0 - min(1.0, width / scale)
    return float(max(0.0, min(1.0, score)))


def run_prophet_forecast(
    db: Session,
    *,
    tenant_id: int,
    horizon_days: int = 30,
    product_id: Optional[int] = None,
) -> SalesForecastResult:
    """
    sales_records + sales_items verisini günlük toplam talebe çevirir,
    Prophet ile gelecek horizon_days gün tahmini üretir ve sales_forecast_results'a kaydeder.
    """
    df = _load_daily_demand(db, tenant_id=tenant_id, product_id=product_id)
    if len(df.index) < 2:
        raise ValueError("Not enough sales data to train Prophet (need at least 2 days).")

    m = Prophet(interval_width=0.8, daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=True)
    m.fit(df)

    future = m.make_future_dataframe(periods=horizon_days, freq="D", include_history=False)
    forecast = m.predict(future)

    daily = []
    for _, row in forecast.iterrows():
        ds = row["ds"]
        yhat = float(row["yhat"])
        yhat_lower = float(row.get("yhat_lower", yhat))
        yhat_upper = float(row.get("yhat_upper", yhat))
        conf = _confidence_from_interval(yhat, yhat_lower, yhat_upper)
        daily.append(
            {
                "date": pd.to_datetime(ds).date().isoformat(),
                "quantity": max(0.0, yhat),
                "yhat_lower": yhat_lower,
                "yhat_upper": yhat_upper,
                "confidence": conf,
            }
        )

    payload = {
        "daily": daily,
        "meta": {
            "engine": "prophet",
            "interval_width": 0.8,
            "trained_points": int(len(df.index)),
            "product_id": product_id,
        },
    }

    to_save = SalesForecastResultCreate(
        model_name="prophet",
        scope="product" if product_id is not None else "global",
        product_id=product_id,
        forecast_start=date.today(),
        horizon_days=horizon_days,
        result_payload=payload,
    )
    return forecast_results_service.create(db, tenant_id, to_save)

