from typing import Sequence, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.schemas.booking import BookingSchema


class BookingRepository(Protocol):
    async def list_bookings(self) -> Sequence[BookingSchema]:
        ...


class SqlAlchemyBookingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_bookings(self) -> list[BookingSchema]:
        result = await self._session.execute(select(Booking))
        bookings = result.scalars().all()
        return [self._map_booking(booking) for booking in bookings]

    def _map_booking(self, booking: Booking) -> BookingSchema:
        return BookingSchema.model_validate(
            {
                "id": booking.id,
                "customer_id": booking.customer_id,
                "shop_id": booking.shop_id,
                "assigned_worker_id": booking.assigned_worker_id,
                "status": booking.booking_status,
                "scheduled_at": booking.scheduled_at,
                "created_at": booking.created_at,
                "updated_at": booking.updated_at,
            }
        )


class InMemoryBookingRepository:
    def __init__(self) -> None:
        self._bookings: list[BookingSchema] = [
            BookingSchema(
                id="00000000-0000-0000-0000-000000000001",
                customer_id="00000000-0000-0000-0000-000000000002",
                shop_id="00000000-0000-0000-0000-000000000003",
                assigned_worker_id=None,
                status="pending",
                scheduled_at="2026-06-01T09:00:00",
                created_at="2026-05-20T08:00:00",
                updated_at="2026-05-20T08:00:00",
            )
        ]

    async def list_bookings(self) -> list[BookingSchema]:
        return self._bookings
