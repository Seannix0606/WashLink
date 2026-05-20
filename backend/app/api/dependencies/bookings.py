from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.repositories.booking_repository import SqlAlchemyBookingRepository
from app.services.booking_service import BookingService


async def get_booking_service(session: AsyncSession = Depends(get_async_session)) -> BookingService:
    repository = SqlAlchemyBookingRepository(session)
    return BookingService(repository)
