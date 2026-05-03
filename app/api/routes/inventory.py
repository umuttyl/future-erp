from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import TenantContext, get_tenant_ctx, require_permission
from app.core.exceptions import NotFoundException, ValidationException
from app.core.permissions import STOCK_ADJUST
from app.schemas.supply_order import AutoDraftSupplyResponse, SupplyOrderOut
from app.services.inventory_service import inventory_service

router = APIRouter()


@router.post(
    "/{product_id}/auto-draft",
    response_model=AutoDraftSupplyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_auto_draft_supply_order(
    product_id: int,
    ctx: TenantContext = Depends(get_tenant_ctx),
    _: object = Depends(require_permission(STOCK_ADJUST)),
    db: Session = Depends(get_db),
    is_ai_override: bool = Query(
        False,
        description=(
            "True ise kritik stok kontrolü atlanır; AI bildiriminden gelen proaktif taslak "
            "(gelecek talep öngörüsü) olarak işlenir."
        ),
    ),
):
    """Stok kritikteyse hedef stok (ve varsa Prophet talebi) ile taslak tedarik satırı oluşturur."""
    try:
        order, meta = inventory_service.auto_draft_supply_order(
            db, ctx.tenant_id, product_id, is_ai_override=is_ai_override
        )
    except ValueError as e:
        code = str(e)
        if code == "PRODUCT_NOT_FOUND":
            raise NotFoundException("Ürün bulunamadı.", code="PRODUCT_NOT_FOUND") from e
        if code == "STOCK_NOT_CRITICAL":
            raise ValidationException(
                "Stok kritik eşikte değil; taslak sipariş oluşturulmadı.",
                code="STOCK_NOT_CRITICAL",
            ) from e
        raise

    return AutoDraftSupplyResponse(
        message="Taslak tedarik siparişi oluşturuldu.",
        order=SupplyOrderOut.model_validate(order),
        stock_before=meta["stock_before"],
        critical_threshold_used=meta["critical_threshold_used"],
        target_stock=meta["target_stock"],
        quantity_from_target_gap=meta["quantity_from_target_gap"],
        prophet_demand_sum_30d=meta["prophet_demand_sum_30d"],
    )
