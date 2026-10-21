from typing import List

from pydantic import ConfigDict, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "WashLink Backend"
    app_env: str = Field(default="development")
    debug: bool = Field(default=True)
    database_url: str = Field(default="sqlite+aiosqlite:///./washlink.db")
    redis_url: str = Field(default="redis://localhost:6379/0")
    cors_origins: List[str] = Field(default=["http://localhost:5173"])
    secret_key: SecretStr = Field(default="dev-secret-key-change-me")
    port: int = Field(default=8000)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


def get_settings() -> Settings:
    return Settings()
