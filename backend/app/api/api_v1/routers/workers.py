from fastapi import APIRouter, Depends

from app.api.dependencies.workers import get_worker_service
from app.schemas.worker import WorkerListResponse

router = APIRouter(prefix="/workers", tags=["workers"])


@router.get("", response_model=WorkerListResponse, summary="List workers")
async def list_workers(service=Depends(get_worker_service)) -> WorkerListResponse:
    workers = await service.list_workers()
    return WorkerListResponse(success=True, data=workers, message="Workers retrieved successfully")
