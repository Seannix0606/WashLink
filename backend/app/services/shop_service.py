from typing import Sequence

from app.repositories.shop_repository import ShopRepository
from app.schemas.shop import ShopSchema


class ShopService:
    def __init__(self, repository: ShopRepository) -> None:
        self._repository = repository

    async def list_shops(self) -> Sequence[ShopSchema]:
        return await self._repository.list_shops()
