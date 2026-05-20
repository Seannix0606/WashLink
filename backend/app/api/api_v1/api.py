from fastapi import APIRouter

from app.api.api_v1.routers import bookings, health, profiles, shops, workers

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(bookings.router)
api_router.include_router(profiles.router)
api_router.include_router(shops.router)
api_router.include_router(workers.router)
