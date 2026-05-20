from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WorkerSchema(BaseModel):
    id: UUID
    owner_id: UUID
    user_id: UUID | None = None
    name: str
    phone_number: str
    is_available: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class WorkerListResponse(BaseModel):
    success: bool = True
    data: list[WorkerSchema] = Field(default_factory=list)
    message: str = "OK"
