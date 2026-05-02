from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Future ERP AI"
    ENV: str = "dev"
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/future_erp_ai"
    AUTO_CREATE_DB: bool = False
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-1.5-flash-latest"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

