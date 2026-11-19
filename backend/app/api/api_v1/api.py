from fastapi import APIRouter, Depends

from app.api.api_v1.routers import bookings, health, profiles, shops, workers
from app.api.dependencies.auth import require_admin_token

api_router = APIRouter(prefix="/api/v1")
# Health stays public. Every data route is operator-only and fails closed (audit finding F3).
operator_only = [Depends(require_admin_token)]
api_router.include_router(health.router)
api_router.include_router(bookings.router, dependencies=operator_only)
api_router.include_router(profiles.router, dependencies=operator_only)
api_router.include_router(shops.router, dependencies=operator_only)
api_router.include_router(workers.router, dependencies=operator_only)
