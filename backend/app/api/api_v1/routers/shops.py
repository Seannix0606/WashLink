from fastapi import APIRouter, Depends

from app.api.dependencies.shops import get_shop_service
from app.schemas.shop import ShopListResponse

router = APIRouter(prefix="/shops", tags=["shops"])


@router.get("", response_model=ShopListResponse, summary="List shops")
async def list_shops(service=Depends(get_shop_service)) -> ShopListResponse:
    shops = await service.list_shops()
    return ShopListResponse(success=True, data=shops, message="Shops retrieved successfully")
