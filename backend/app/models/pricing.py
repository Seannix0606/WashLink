"""
Pricing model for shop vehicle service pricing.
Follows clean architecture patterns.
"""
from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, Float, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base


class ShopPricing(Base):
    """
    Represents pricing for a specific vehicle type at a shop.
    
    Attributes:
        id: Unique identifier
        shop_id: Reference to shop
        vehicle_type: Type of vehicle (sedan, suv, motorcycle, etc.)
        price: Service price in currency units
        notes: Optional pricing notes
        created_at: Record creation timestamp
        updated_at: Record last update timestamp
    """
    __tablename__ = "shop_pricing"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    vehicle_type = Column(String(50), nullable=False)  # sedan, suv, motorcycle, truck, van, etc.
    price = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Indexes for efficient queries
    __table_args__ = (
        Index("ix_shop_pricing_shop_id", "shop_id"),
        Index("ix_shop_pricing_vehicle_type", "shop_id", "vehicle_type"),
    )

    def __repr__(self) -> str:
        return f"<ShopPricing(shop_id={self.shop_id}, vehicle_type={self.vehicle_type}, price={self.price})>"
