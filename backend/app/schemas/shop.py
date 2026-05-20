from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ShopSchema(BaseModel):
    id: UUID
    owner_id: UUID
    name: str
    address: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class ShopListResponse(BaseModel):
    success: bool = True
    data: list[ShopSchema] = Field(default_factory=list)
    message: str = "OK"
