from fastapi import APIRouter, Depends

from app.api.routes import (
    admin,
    ai,
    anomaly,
    auth,
    customers,
    finance,
    forecast,
    hr,
    inventory,
    nlp,
    onboarding,
    products,
    sales,
    suppliers,
    ws_notifications,
)
from app.core.deps import require_module

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(
    customers.router, prefix="/customers", tags=["customers"],
    dependencies=[Depends(require_module("crm"))],
)
api_router.include_router(
    suppliers.router, prefix="/suppliers", tags=["suppliers"],
    dependencies=[Depends(require_module("suppliers"))],
)
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(
    inventory.router, prefix="/inventory", tags=["inventory"],
    dependencies=[Depends(require_module("inventory"))],
)
api_router.include_router(
    sales.router, prefix="/sales", tags=["sales"],
    dependencies=[Depends(require_module("sales"))],
)
api_router.include_router(
    finance.router, prefix="/finance", tags=["finance"],
    dependencies=[Depends(require_module("finance"))],
)
api_router.include_router(
    forecast.router, prefix="/forecast", tags=["forecast"],
    dependencies=[Depends(require_module("ai"))],
)
api_router.include_router(
    ai.router, prefix="/ai", tags=["ai"],
    dependencies=[Depends(require_module("ai"))],
)
api_router.include_router(nlp.router, prefix="/nlp", tags=["nlp"])
api_router.include_router(nlp.nlp_chat_api_router)
api_router.include_router(
    hr.router, prefix="/hr", tags=["hr"],
    dependencies=[Depends(require_module("hr"))],
)
api_router.include_router(ws_notifications.router, tags=["ws"])
api_router.include_router(onboarding.router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(anomaly.router, prefix="/anomaly", tags=["anomaly"])
