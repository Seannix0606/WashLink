from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.repositories.shop_repository import SqlAlchemyShopRepository
from app.services.shop_service import ShopService


async def get_shop_service(session: AsyncSession = Depends(get_async_session)) -> ShopService:
    repository = SqlAlchemyShopRepository(session)
    return ShopService(repository)
