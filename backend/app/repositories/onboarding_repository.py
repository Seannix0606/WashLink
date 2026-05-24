"""
Repository layer for onboarding data access.
Implements data access patterns with clean abstractions.
"""
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.onboarding import Location, OnboardingSession, Pricing


class PricingRepository:
    """Repository for Pricing model operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, shop_id: UUID, vehicle_type: str, price: int, notes: Optional[str] = None) -> Pricing:
        """Create new pricing entry."""
        pricing = Pricing(shop_id=shop_id, vehicle_type=vehicle_type, price=price, notes=notes)
        self.session.add(pricing)
        await self.session.flush()
        return pricing

    async def get_by_shop_and_type(self, shop_id: UUID, vehicle_type: str) -> Optional[Pricing]:
        """Get pricing by shop and vehicle type."""
        result = await self.session.execute(
            select(Pricing).where(Pricing.shop_id == shop_id).where(Pricing.vehicle_type == vehicle_type)
        )
        return result.scalar_one_or_none()

    async def get_all_by_shop(self, shop_id: UUID) -> List[Pricing]:
        """Get all pricing entries for a shop."""
        result = await self.session.execute(select(Pricing).where(Pricing.shop_id == shop_id))
        return result.scalars().all()

    async def update(self, pricing_id: UUID, price: int, notes: Optional[str] = None) -> Optional[Pricing]:
        """Update existing pricing entry."""
        pricing = await self.session.get(Pricing, pricing_id)
        if pricing:
            pricing.price = price
            if notes is not None:
                pricing.notes = notes
            await self.session.flush()
        return pricing

    async def delete(self, pricing_id: UUID) -> bool:
        """Delete pricing entry."""
        pricing = await self.session.get(Pricing, pricing_id)
        if pricing:
            await self.session.delete(pricing)
            await self.session.flush()
            return True
        return False

    async def delete_all_by_shop(self, shop_id: UUID) -> int:
        """Delete all pricing entries for a shop."""
        result = await self.session.execute(select(Pricing).where(Pricing.shop_id == shop_id))
        pricings = result.scalars().all()
        for pricing in pricings:
            await self.session.delete(pricing)
        await self.session.flush()
        return len(pricings)


class LocationRepository:
    """Repository for Location model operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self, shop_id: UUID, address: str, latitude: Optional[float] = None, longitude: Optional[float] = None
    ) -> Location:
        """Create new location entry."""
        location = Location(shop_id=shop_id, address=address, latitude=latitude, longitude=longitude)
        self.session.add(location)
        await self.session.flush()
        return location

    async def get_by_shop(self, shop_id: UUID) -> Optional[Location]:
        """Get location by shop ID."""
        result = await self.session.execute(select(Location).where(Location.shop_id == shop_id))
        return result.scalar_one_or_none()

    async def update(
        self, shop_id: UUID, address: str, latitude: Optional[float] = None, longitude: Optional[float] = None
    ) -> Optional[Location]:
        """Update existing location (or create if doesn't exist)."""
        location = await self.get_by_shop(shop_id)
        if location:
            location.address = address
            location.latitude = latitude
            location.longitude = longitude
            await self.session.flush()
        else:
            location = await self.create(shop_id, address, latitude, longitude)
        return location

    async def delete(self, shop_id: UUID) -> bool:
        """Delete location entry."""
        location = await self.get_by_shop(shop_id)
        if location:
            await self.session.delete(location)
            await self.session.flush()
            return True
        return False


class OnboardingSessionRepository:
    """Repository for OnboardingSession model operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, shop_id: UUID) -> OnboardingSession:
        """Create new onboarding session."""
        session = OnboardingSession(shop_id=shop_id, current_step=1)
        self.session.add(session)
        await self.session.flush()
        return session

    async def get_by_shop(self, shop_id: UUID) -> Optional[OnboardingSession]:
        """Get onboarding session by shop ID."""
        result = await self.session.execute(select(OnboardingSession).where(OnboardingSession.shop_id == shop_id))
        return result.scalar_one_or_none()

    async def update_step(self, shop_id: UUID, current_step: int) -> Optional[OnboardingSession]:
        """Update current step."""
        session = await self.get_by_shop(shop_id)
        if session:
            session.current_step = current_step
            await self.session.flush()
        return session

    async def mark_pricing_completed(self, shop_id: UUID) -> Optional[OnboardingSession]:
        """Mark pricing as completed."""
        session = await self.get_by_shop(shop_id)
        if session:
            session.pricing_completed = 1
            await self.session.flush()
        return session

    async def mark_location_completed(self, shop_id: UUID) -> Optional[OnboardingSession]:
        """Mark location as completed."""
        session = await self.get_by_shop(shop_id)
        if session:
            session.location_completed = 1
            await self.session.flush()
        return session
