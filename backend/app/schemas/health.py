from typing import Dict

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    success: bool = True
    message: str = "Application is healthy."
    data: Dict[str, str] = Field(default_factory=lambda: {"status": "ok"})
