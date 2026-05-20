from typing import List
from pydantic import BaseSettings, AnyUrl, Field, SecretStr


class Settings(BaseSettings):
    app_name: str = "WashLink Backend"
    app_env: str = Field(default="development", env="APP_ENV")
    debug: bool = Field(default=True, env="APP_DEBUG")
    database_url: AnyUrl = Field(..., env="DATABASE_URL")
    redis_url: AnyUrl = Field(..., env="REDIS_URL")
    cors_origins: List[str] = Field(default_factory=lambda: ["http://localhost:5173"], env="CORS_ORIGINS")
    secret_key: SecretStr = Field(..., env="SECRET_KEY")
    port: int = Field(default=8000, env="PORT")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


def get_settings() -> Settings:
    return Settings()
