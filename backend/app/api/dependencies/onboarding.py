"""
Dependency injection for onboarding services.
Follows FastAPI best practices for service initialization.
"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.services.onboarding_service import (
    OnboardingService,
    OnboardingSessionService,
    LocationService,
    PricingService,
)


async def get_pricing_service(session: AsyncSession = None) -> PricingService:
    """Provide PricingService instance."""
    if session is None:
        session = await get_session().__anext__()
    return PricingService(session)


async def get_location_service(session: AsyncSession = None) -> LocationService:
    """Provide LocationService instance."""
    if session is None:
        session = await get_session().__anext__()
    return LocationService(session)


async def get_onboarding_session_service(session: AsyncSession = None) -> OnboardingSessionService:
    """Provide OnboardingSessionService instance."""
    if session is None:
        session = await get_session().__anext__()
    return OnboardingSessionService(session)


async def get_onboarding_service(session: AsyncSession = None) -> OnboardingService:
    """Provide OnboardingService instance."""
    if session is None:
        session = await get_session().__anext__()
    return OnboardingService(session)


# Simplified versions using Depends pattern
from fastapi import Depends


def get_pricing_service_depends(session: AsyncSession = Depends(get_session)) -> PricingService:
    return PricingService(session)


def get_location_service_depends(session: AsyncSession = Depends(get_session)) -> LocationService:
    return LocationService(session)


def get_onboarding_service_depends(session: AsyncSession = Depends(get_session)) -> OnboardingService:
    return OnboardingService(session)


def get_onboarding_session_service_depends(session: AsyncSession = Depends(get_session)) -> OnboardingSessionService:
    return OnboardingSessionService(session)
