from __future__ import annotations

import json
import sys
from pathlib import Path

from sqlalchemy.orm import Session

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.db import SessionLocal, init_db  # noqa: E402
from app.services.forecasting import run_prophet_forecast  # noqa: E402


def main() -> None:
    init_db()
    db: Session = SessionLocal()
    try:
        res = run_prophet_forecast(db, horizon_days=30, product_id=None)
        daily = res.result_payload.get("daily", [])
        print("OK: saved sales_forecast_results.id =", res.id)
        print("first_3_days =", json.dumps(daily[:3], ensure_ascii=False, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    main()

