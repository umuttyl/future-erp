from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.sales_forecast_result import SalesForecastResult
from app.schemas.sales_forecast_result import SalesForecastResultCreate


class ForecastResultsService:
    def create(self, db: Session, data: SalesForecastResultCreate) -> SalesForecastResult:
        obj = SalesForecastResult(**data.model_dump())
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    def list(self, db: Session) -> list[SalesForecastResult]:
        return list(db.scalars(select(SalesForecastResult).order_by(SalesForecastResult.id.desc())).all())


forecast_results_service = ForecastResultsService()

