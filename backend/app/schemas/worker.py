from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WorkerSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    owner_id: UUID
    user_id: UUID | None = None
    name: str
    phone_number: str
    is_available: bool
    created_at: datetime
    updated_at: datetime


class WorkerListResponse(BaseModel):
    success: bool = True
    data: list[WorkerSchema] = Field(default_factory=list)
    message: str = "OK"
