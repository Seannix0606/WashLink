from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.repositories.worker_repository import SqlAlchemyWorkerRepository
from app.services.worker_service import WorkerService


async def get_worker_service(session: AsyncSession = Depends(get_async_session)) -> WorkerService:
    repository = SqlAlchemyWorkerRepository(session)
    return WorkerService(repository)
