import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models import Base
from app.models.profile import Profile
from app.models.shop import Shop
from app.models.worker import Worker


def create_sample_data(session: AsyncSession) -> None:
    customer_profile = Profile(
        id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        role="customer",
        full_name="Sample Customer",
        phone_number="+10000000001",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    owner_profile = Profile(
        id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        role="owner",
        full_name="Sample Owner",
        phone_number="+10000000002",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    shop = Shop(
        id=uuid.UUID("00000000-0000-0000-0000-000000000010"),
        owner_id=owner_profile.id,
        name="Downtown Wash Hub",
        address="123 Main Street, Anytown",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    worker = Worker(
        id=uuid.UUID("00000000-0000-0000-0000-000000000020"),
        owner_id=owner_profile.id,
        user_id=None,
        name="Jesse Baker",
        phone_number="+10000000003",
        is_available=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    session.add_all([customer_profile, owner_profile, shop, worker])


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await session.run_sync(Base.metadata.create_all)
        create_sample_data(session)
        await session.commit()


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
