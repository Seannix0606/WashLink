from typing import Sequence

from app.repositories.worker_repository import WorkerRepository
from app.schemas.worker import WorkerSchema


class WorkerService:
    def __init__(self, repository: WorkerRepository) -> None:
        self._repository = repository

    async def list_workers(self) -> Sequence[WorkerSchema]:
        return await self._repository.list_workers()
