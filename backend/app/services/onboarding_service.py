"""
Service layer for onboarding business logic.
Implements business rules and orchestration.
Follows Single Responsibility Principle.
"""
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.onboarding import Pricing
from app.repositories.onboarding_repository import (
    LocationRepository,
    OnboardingSessionRepository,
    PricingRepository,
)
from app.schemas.onboarding import (
    LocationRequestSchema,
    LocationResponseSchema,
    OnboardingReviewSchema,
    OnboardingSessionSchema,
    PricingRequestSchema,
    PricingResponseSchema,
)


class PricingService:
    """Service for pricing-related operations."""

    def __init__(self, session: AsyncSession):
        self.repository = PricingRepository(session)
        self.session = session

    async def save_pricing(self, shop_id: UUID, pricing_data: Dict[str, int]) -> List[PricingResponseSchema]:
        """
        Save or update pricing for multiple vehicle types.
        Replaces all existing pricing for the shop.
        """
        # Delete existing pricing
        await self.repository.delete_all_by_shop(shop_id)

        # Create new pricing entries
        created_pricings = []
        for vehicle_type, price in pricing_data.items():
            pricing = await self.repository.create(shop_id=shop_id, vehicle_type=vehicle_type, price=price)
            created_pricings.append(PricingResponseSchema.model_validate(pricing))

        await self.session.commit()
        return created_pricings

    async def get_pricing(self, shop_id: UUID) -> Dict[str, int]:
        """Get pricing as dictionary keyed by vehicle type."""
        pricings = await self.repository.get_all_by_shop(shop_id)
        return {p.vehicle_type: p.price for p in pricings}

    async def get_pricing_details(self, shop_id: UUID) -> List[PricingResponseSchema]:
        """Get detailed pricing information."""
        pricings = await self.repository.get_all_by_shop(shop_id)
        return [PricingResponseSchema.model_validate(p) for p in pricings]

    async def update_pricing(self, shop_id: UUID, pricing_data: Dict[str, int]) -> List[PricingResponseSchema]:
        """Update pricing (same as save_pricing for this design)."""
        return await self.save_pricing(shop_id, pricing_data)


class LocationService:
    """Service for location-related operations."""

    def __init__(self, session: AsyncSession):
        self.repository = LocationRepository(session)
        self.session = session

    async def save_location(self, request: LocationRequestSchema) -> LocationResponseSchema:
        """Save or update location."""
        location = await self.repository.update(
            shop_id=request.shop_id,
            address=request.address,
            latitude=request.latitude,
            longitude=request.longitude,
        )
        await self.session.commit()
        return LocationResponseSchema.model_validate(location)

    async def get_location(self, shop_id: UUID) -> Optional[LocationResponseSchema]:
        """Get location for a shop."""
        location = await self.repository.get_by_shop(shop_id)
        if location:
            return LocationResponseSchema.model_validate(location)
        return None

    async def update_location(self, request: LocationRequestSchema) -> LocationResponseSchema:
        """Update existing location."""
        return await self.save_location(request)


class OnboardingSessionService:
    """Service for tracking onboarding progress."""

    def __init__(self, session: AsyncSession):
        self.session_repository = OnboardingSessionRepository(session)
        self.session = session

    async def create_session(self, shop_id: UUID) -> OnboardingSessionSchema:
        """Create new onboarding session."""
        session = await self.session_repository.create(shop_id)
        await self.session.commit()
        return OnboardingSessionSchema.model_validate(session)

    async def get_session(self, shop_id: UUID) -> Optional[OnboardingSessionSchema]:
        """Get onboarding session."""
        session = await self.session_repository.get_by_shop(shop_id)
        if session:
            return OnboardingSessionSchema.model_validate(session)
        return None

    async def advance_step(self, shop_id: UUID, target_step: int) -> OnboardingSessionSchema:
        """Advance to next step."""
        session = await self.session_repository.update_step(shop_id, target_step)
        await self.session.commit()
        return OnboardingSessionSchema.model_validate(session)

    async def mark_pricing_done(self, shop_id: UUID) -> OnboardingSessionSchema:
        """Mark pricing as completed."""
        session = await self.session_repository.mark_pricing_completed(shop_id)
        await self.session.commit()
        return OnboardingSessionSchema.model_validate(session)

    async def mark_location_done(self, shop_id: UUID) -> OnboardingSessionSchema:
        """Mark location as completed."""
        session = await self.session_repository.mark_location_completed(shop_id)
        await self.session.commit()
        return OnboardingSessionSchema.model_validate(session)


class OnboardingService:
    """
    Orchestration service for complete onboarding flow.
    Coordinates pricing, location, and session services.
    """

    def __init__(self, session: AsyncSession):
        self.pricing_service = PricingService(session)
        self.location_service = LocationService(session)
        self.session_service = OnboardingSessionService(session)
        self.session = session

    async def complete_onboarding(
        self, shop_id: UUID
    ) -> Dict:
        """
        Mark onboarding as complete.
        Business rule: Pricing and location must both be completed.
        """
        onboarding = await self.session_service.get_session(shop_id)

        if not onboarding:
            raise ValueError(f"Onboarding session not found for shop {shop_id}")

        if not (onboarding.pricing_completed and onboarding.location_completed):
            raise ValueError("Pricing and location must be completed before finishing setup")

        # Update shop status to active in main query
        await self.session_service.advance_step(shop_id, 5)

        return {"status": "completed", "shop_id": shop_id}

    async def get_onboarding_review(self, shop_id: UUID) -> Optional[OnboardingReviewSchema]:
        """Get all onboarding data for review page."""
        pricing = await self.pricing_service.get_pricing(shop_id)
        location = await self.location_service.get_location(shop_id)

        if not pricing or not location:
            return None

        # In real scenario, would fetch actual shop from Shop table
        # For now, returning aggregated data
        return OnboardingReviewSchema(
            shop_id=shop_id,
            shop_name="",  # Would be fetched from Shop model
            pricing=pricing,
            location=location,
            created_at=location.created_at,
            updated_at=location.updated_at,
        )
