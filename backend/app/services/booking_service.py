from typing import Sequence

from app.repositories.booking_repository import BookingRepository
from app.schemas.booking import BookingSchema


class BookingService:
    def __init__(self, repository: BookingRepository) -> None:
        self._repository = repository

    async def list_bookings(self) -> Sequence[BookingSchema]:
        return await self._repository.list_bookings()
