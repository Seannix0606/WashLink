from typing import Sequence, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Profile
from app.schemas.profile import ProfileSchema


class ProfileRepository(Protocol):
    async def list_profiles(self) -> Sequence[ProfileSchema]:
        ...


class SqlAlchemyProfileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_profiles(self) -> list[ProfileSchema]:
        result = await self._session.execute(select(Profile))
        profiles = result.scalars().all()
        return [ProfileSchema.model_validate(profile) for profile in profiles]
