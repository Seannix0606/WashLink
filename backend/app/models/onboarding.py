"""
Onboarding models for shop pricing and location setup.
Follows SOLID principles with single responsibility per model.
"""
import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.models.base import Base


class Pricing(Base):
    """
    Stores pricing per shop and vehicle type.
    Allows multiple vehicle types per shop with independent pricing.
    """

    __tablename__ = "pricing"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False)
    vehicle_type = Column(String(length=50), nullable=False)  # sedan, suv, motorcycle, etc.
    price = Column(Integer, nullable=False)  # stored in cents to avoid float precision issues
    notes = Column(String(length=500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        # Ensure one pricing per shop/vehicle_type combination
        # This would be added as a unique constraint in migration if using traditional DB
    )


class Location(Base):
    """
    Stores shop location with coordinates for map display.
    One location per shop - location is updated via PUT, not created multiple times.
    """

    __tablename__ = "locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False, unique=True)
    address = Column(String(length=512), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class OnboardingSession(Base):
    """
    Tracks onboarding progress per shop.
    Helps identify which shops are in draft vs active state.
    """

    __tablename__ = "onboarding_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False, unique=True)
    current_step = Column(Integer, default=1, nullable=False)  # 1=Welcome, 2=Pricing, 3=Location, 4=Review, 5=Complete
    pricing_completed = Column(Integer, default=0, nullable=False)  # boolean stored as int
    location_completed = Column(Integer, default=0, nullable=False)  # boolean stored as int
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
