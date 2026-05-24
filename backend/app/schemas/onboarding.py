"""
Pydantic schemas for onboarding flow.
Includes validation for all input/output models.
"""
from datetime import datetime
from typing import Dict, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PricingItemSchema(BaseModel):
    """Individual pricing entry for a vehicle type."""

    vehicle_type: str = Field(..., min_length=1, max_length=50, description="Vehicle type (sedan, suv, motorcycle, etc.)")
    price: int = Field(..., ge=0, description="Price in cents (non-negative)")
    notes: Optional[str] = Field(default=None, max_length=500, description="Optional notes about pricing")

    @field_validator("price")
    @classmethod
    def validate_price(cls, v: int) -> int:
        """Ensure price is not negative."""
        if v < 0:
            raise ValueError("Price must be non-negative")
        return v


class PricingRequestSchema(BaseModel):
    """Request schema for pricing setup."""

    shop_id: UUID
    pricing: Dict[str, int] = Field(..., description="Keyed by vehicle_type with price in cents")

    @field_validator("pricing")
    @classmethod
    def validate_pricing_dict(cls, v: Dict[str, int]) -> Dict[str, int]:
        """Validate pricing dictionary structure."""
        if not v:
            raise ValueError("Pricing cannot be empty")
        for vehicle_type, price in v.items():
            if not vehicle_type or not isinstance(vehicle_type, str):
                raise ValueError("Vehicle type must be non-empty string")
            if not isinstance(price, int) or price < 0:
                raise ValueError(f"Price for {vehicle_type} must be non-negative integer")
        return v


class PricingResponseSchema(BaseModel):
    """Response schema for pricing data."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    shop_id: UUID
    vehicle_type: str
    price: int
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LocationRequestSchema(BaseModel):
    """Request schema for location setup."""

    shop_id: UUID
    address: str = Field(..., min_length=5, max_length=512, description="Full address")
    latitude: Optional[float] = Field(default=None, ge=-90, le=90, description="Latitude coordinate")
    longitude: Optional[float] = Field(default=None, ge=-180, le=180, description="Longitude coordinate")


class LocationResponseSchema(BaseModel):
    """Response schema for location data."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    shop_id: UUID
    address: str
    latitude: Optional[float]
    longitude: Optional[float]
    created_at: datetime
    updated_at: datetime


class OnboardingSessionSchema(BaseModel):
    """Response schema for onboarding session."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    shop_id: UUID
    current_step: int
    pricing_completed: bool
    location_completed: bool
    created_at: datetime
    updated_at: datetime


class OnboardingCompleteRequestSchema(BaseModel):
    """Request schema for completing onboarding."""

    shop_id: UUID
    status: str = Field(default="active", description="Shop status (active, inactive, etc.)")


class OnboardingReviewSchema(BaseModel):
    """Schema for review step - aggregates all onboarding data."""

    shop_id: UUID
    shop_name: str
    pricing: Dict[str, int]  # vehicle_type -> price
    location: LocationResponseSchema
    created_at: datetime
    updated_at: datetime
