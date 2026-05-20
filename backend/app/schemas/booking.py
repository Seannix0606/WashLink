from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, constr


class BookingSchema(BaseModel):
    id: UUID
    customer_id: UUID
    shop_id: UUID
    assigned_worker_id: UUID | None = None
    status: constr(regex="^(pending|accepted|in_progress|completed|rejected)$") = Field(alias="booking_status")
    scheduled_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
        allow_population_by_field_name = True


class BookingListResponse(BaseModel):
    success: bool = True
    data: list[BookingSchema] = Field(default_factory=list)
    message: str = "OK"
