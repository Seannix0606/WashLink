from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProfileSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    role: Annotated[str, Field(pattern="^(customer|owner|worker)$")]
    full_name: str
    phone_number: str
    created_at: datetime
    updated_at: datetime


class ProfileListResponse(BaseModel):
    success: bool = True
    data: list[ProfileSchema] = Field(default_factory=list)
    message: str = "OK"
