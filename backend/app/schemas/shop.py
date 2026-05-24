from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ShopSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    owner_id: UUID
    name: str
    address: str | None = None
    created_at: datetime
    updated_at: datetime


class ShopListResponse(BaseModel):
    success: bool = True
    data: list[ShopSchema] = Field(default_factory=list)
    message: str = "OK"
