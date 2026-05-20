from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.repositories.profile_repository import SqlAlchemyProfileRepository
from app.services.profile_service import ProfileService


async def get_profile_service(session: AsyncSession = Depends(get_async_session)) -> ProfileService:
    repository = SqlAlchemyProfileRepository(session)
    return ProfileService(repository)
