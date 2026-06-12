from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.sales_forecast_result import SalesForecastResult
from app.schemas.sales_forecast_result import SalesForecastResultCreate


class ForecastResultsService:
    def create(self, db: Session, tenant_id: int, data: SalesForecastResultCreate) -> SalesForecastResult:
        d = data.model_dump()
        d["tenant_id"] = tenant_id
        obj = SalesForecastResult(**d)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    def list(self, db: Session, tenant_id: int) -> list[SalesForecastResult]:
        stmt = (
            select(SalesForecastResult)
            .where(SalesForecastResult.tenant_id == tenant_id)
            .order_by(SalesForecastResult.id.desc())
        )
        return list(db.scalars(stmt).all())


forecast_results_service = ForecastResultsService()
