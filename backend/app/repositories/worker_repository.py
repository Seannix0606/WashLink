from typing import Sequence, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.worker import Worker
from app.schemas.worker import WorkerSchema


class WorkerRepository(Protocol):
    async def list_workers(self) -> Sequence[WorkerSchema]:
        ...


class SqlAlchemyWorkerRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_workers(self) -> list[WorkerSchema]:
        result = await self._session.execute(select(Worker))
        workers = result.scalars().all()
        return [WorkerSchema.model_validate(worker) for worker in workers]
