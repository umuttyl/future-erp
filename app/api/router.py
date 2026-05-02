from fastapi import APIRouter

from app.api.routes import ai, finance, forecast, nlp, products, sales


api_router = APIRouter()
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(sales.router, prefix="/sales", tags=["sales"])
api_router.include_router(finance.router, prefix="/finance", tags=["finance"])
api_router.include_router(forecast.router, prefix="/forecast", tags=["forecast"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(nlp.router, prefix="/nlp", tags=["nlp"])
