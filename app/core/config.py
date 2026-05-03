from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Future ERP AI"
    ENV: str = "dev"
    LOG_LEVEL: str = "INFO"
    # Faz 0: varsayılan SQLite — `.env.example` ile aynı (Postgres `DATABASE_URL` ile ezilir).
    DATABASE_URL: str = "sqlite:///./future_erp_ai.db"
    AUTO_CREATE_DB: bool = False
    JWT_SECRET_KEY: str = "dev-only-change-in-production-minimum-48-char-secret-key-xx"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_EXPIRE_DAYS: int = 7
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-1.5-flash-latest"
    #: Virgülle ayrılmış origin listesi (Vite varsayılanı dahil).
    CORS_ORIGINS: str = "http://127.0.0.1:5173,http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()

