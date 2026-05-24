from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BookingSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    
    id: UUID
    customer_id: UUID
    shop_id: UUID
    assigned_worker_id: UUID | None = None
    status: Annotated[str, Field(pattern="^(pending|accepted|in_progress|completed|rejected)$")] = Field(alias="booking_status")
    scheduled_at: datetime
    created_at: datetime
    updated_at: datetime


class BookingListResponse(BaseModel):
    success: bool = True
    data: list[BookingSchema] = Field(default_factory=list)
    message: str = "OK"
