from fastapi import APIRouter, Depends

from app.api.dependencies.bookings import get_booking_service
from app.schemas.booking import BookingListResponse

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.get("", response_model=BookingListResponse, summary="List bookings")
async def list_bookings(service=Depends(get_booking_service)) -> BookingListResponse:
    bookings = await service.list_bookings()
    return BookingListResponse(success=True, data=bookings, message="Bookings retrieved successfully")
