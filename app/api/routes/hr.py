from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.permissions import HR_PERFORMANCE_READ
from app.schemas.hr import EmployeePerformanceOut
from app.services.hr_performance_service import hr_performance_service

router = APIRouter()


@router.get("/employee-performance", response_model=List[EmployeePerformanceOut])
def get_employee_performance(
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(HR_PERFORMANCE_READ)),
    db: Session = Depends(get_db),
):
    """Kiracı çalışanları için verimlilik skoru ve kısa AI içgörüsü (satış atfı yoksa proxy skor)."""
    raw = hr_performance_service.list_employee_performance(db, ctx.tenant_id)
    return [EmployeePerformanceOut.model_validate(r) for r in raw]
