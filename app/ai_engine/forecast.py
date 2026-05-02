from __future__ import annotations

from datetime import date, timedelta


def naive_daily_forecast(*, start: date, horizon_days: int, base_value: float = 0.0) -> dict:
    daily = []
    for i in range(horizon_days):
        d = start + timedelta(days=i)
        daily.append({"date": d.isoformat(), "value": float(base_value)})
    return {"daily": daily, "meta": {"engine": "naive", "base_value": base_value}}

