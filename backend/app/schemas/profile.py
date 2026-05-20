from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, constr


class ProfileSchema(BaseModel):
    id: UUID
    role: constr(regex="^(customer|owner|worker)$")
    full_name: str
    phone_number: str
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class ProfileListResponse(BaseModel):
    success: bool = True
    data: list[ProfileSchema] = Field(default_factory=list)
    message: str = "OK"
