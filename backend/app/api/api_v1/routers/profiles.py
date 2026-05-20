from fastapi import APIRouter, Depends

from app.api.dependencies.profiles import get_profile_service
from app.schemas.profile import ProfileListResponse

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("", response_model=ProfileListResponse, summary="List profiles")
async def list_profiles(service=Depends(get_profile_service)) -> ProfileListResponse:
    profiles = await service.list_profiles()
    return ProfileListResponse(success=True, data=profiles, message="Profiles retrieved successfully")
