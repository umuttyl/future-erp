"""FastAPI uygulama factory'si.

Tablo oluşturma artık Alembic migration'ları ile yapılıyor:
    alembic upgrade head

Bu dosyada init_db() çağrısı YOK. Schema yönetimi tamamen Alembic'e devredilmiştir.
"""
from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title=settings.PROJECT_NAME)
    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
