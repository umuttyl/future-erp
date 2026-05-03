from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.permissions import AI_INSIGHTS_READ
from app.models.product import Product
from app.services.ai_insights import build_insights

router = APIRouter()


class StockAlert(BaseModel):
    id: int
    sku: str
    name: str
    category: Optional[str] = None
    stock_quantity: int
    reorder_level: int
    deficit: int


@router.get("/insights")
def get_insights(
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(AI_INSIGHTS_READ)),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return build_insights(db, ctx.tenant_id)


@router.get("/stock-alerts", response_model=List[StockAlert])
def stock_alerts(
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(AI_INSIGHTS_READ)),
    db: Session = Depends(get_db),
) -> List[StockAlert]:
    products = list(db.scalars(select(Product).where(Product.tenant_id == ctx.tenant_id)).all())
    alerts: List[StockAlert] = []
    for p in products:
        rl = int(p.reorder_level or 0)
        sq = int(p.stock_quantity or 0)
        if rl > 0 and sq <= rl:
            alerts.append(
                StockAlert(
                    id=p.id,
                    sku=p.sku,
                    name=p.name,
                    category=p.category,
                    stock_quantity=sq,
                    reorder_level=rl,
                    deficit=max(0, rl - sq),
                )
            )
    alerts.sort(key=lambda a: (a.stock_quantity - a.reorder_level))
    return alerts
