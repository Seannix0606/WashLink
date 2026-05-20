from fastapi import APIRouter, Depends

from app.api.dependencies.health import get_health_service
from app.schemas.health import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse, summary="Read application health")
async def read_health(service=Depends(get_health_service)) -> HealthResponse:
    return service.get_status()
