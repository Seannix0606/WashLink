from typing import Sequence, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shop import Shop
from app.schemas.shop import ShopSchema


class ShopRepository(Protocol):
    async def list_shops(self) -> Sequence[ShopSchema]:
        ...


class SqlAlchemyShopRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_shops(self) -> list[ShopSchema]:
        result = await self._session.execute(select(Shop))
        shops = result.scalars().all()
        return [ShopSchema.model_validate(shop) for shop in shops]
