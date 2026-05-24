"""
Location model for shop physical location.
Follows clean architecture patterns.
"""
from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base


class ShopLocation(Base):
    """
    Represents the physical location of a shop.
    
    Attributes:
        id: Unique identifier
        shop_id: Reference to shop
        address: Full address string
        latitude: Geographic latitude
        longitude: Geographic longitude
        created_at: Record creation timestamp
        updated_at: Record last update timestamp
    """
    __tablename__ = "shop_locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, unique=True)
    address = Column(String(500), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Indexes for efficient queries
    __table_args__ = (
        Index("ix_shop_location_shop_id", "shop_id"),
    )

    def __repr__(self) -> str:
        return f"<ShopLocation(shop_id={self.shop_id}, address={self.address})>"
