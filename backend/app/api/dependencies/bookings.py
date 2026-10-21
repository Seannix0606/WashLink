from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_async_session
from app.repositories.booking_repository import (
    InMemoryBookingRepository,
    SqlAlchemyBookingRepository,
)
from app.services.booking_service import BookingService


async def get_booking_service(session: AsyncSession = Depends(get_async_session)) -> BookingService:
    settings = get_settings()
    if settings.app_env == "test" or str(settings.database_url).startswith("sqlite"):
        return BookingService(InMemoryBookingRepository())

    repository = SqlAlchemyBookingRepository(session)
    return BookingService(repository)
