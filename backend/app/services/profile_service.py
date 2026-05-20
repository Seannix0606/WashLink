from typing import Sequence

from app.repositories.profile_repository import ProfileRepository
from app.schemas.profile import ProfileSchema


class ProfileService:
    def __init__(self, repository: ProfileRepository) -> None:
        self._repository = repository

    async def list_profiles(self) -> Sequence[ProfileSchema]:
        return await self._repository.list_profiles()
