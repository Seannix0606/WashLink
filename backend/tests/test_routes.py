from fastapi.testclient import TestClient

from app.api.dependencies.bookings import get_booking_service
from app.api.dependencies.profiles import get_profile_service
from app.api.dependencies.shops import get_shop_service
from app.api.dependencies.workers import get_worker_service
from app.main import app


class DummyService:
    async def list_bookings(self):
        return []

    async def list_profiles(self):
        return []

    async def list_shops(self):
        return []

    async def list_workers(self):
        return []


def test_health_route_returns_success() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_domain_routes_are_registered() -> None:
    client = TestClient(app)
    app.dependency_overrides[get_booking_service] = lambda: DummyService()
    app.dependency_overrides[get_profile_service] = lambda: DummyService()
    app.dependency_overrides[get_shop_service] = lambda: DummyService()
    app.dependency_overrides[get_worker_service] = lambda: DummyService()

    try:
        assert client.get("/api/v1/bookings").status_code == 200
        assert client.get("/api/v1/profiles").status_code == 200
        assert client.get("/api/v1/shops").status_code == 200
        assert client.get("/api/v1/workers").status_code == 200
    finally:
        app.dependency_overrides.clear()
