from typing import List
from pydantic import AnyUrl, Field, SecretStr, ConfigDict, field_validator
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
    database_url: AnyUrl
    redis_url: AnyUrl
    cors_origins: List[str] = Field(default=["http://localhost:5173"])
    secret_key: SecretStr
    port: int = Field(default=8000)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


def get_settings() -> Settings:
    return Settings()
