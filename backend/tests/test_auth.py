"""Regression tests for audit finding F3: the legacy data routes are operator-only and fail closed."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies.profiles import get_profile_service
from app.core.config import get_settings
from app.main import app
from app.schemas.profile import ProfileSchema

from .conftest import TEST_ADMIN_TOKEN, settings_with_token

DATA_ROUTES = ["/api/v1/bookings", "/api/v1/profiles", "/api/v1/shops", "/api/v1/workers"]


class SyntheticProfiles:
    async def list_profiles(self):
        now = datetime.now(UTC)
        return [ProfileSchema(id=uuid4(), role="customer", full_name="Synthetic Person", phone_number="09170000099",
                              created_at=now, updated_at=now)]


@pytest.fixture
def client():
    app.dependency_overrides[get_profile_service] = lambda: SyntheticProfiles()
    yield TestClient(app)
    app.dependency_overrides.pop(get_profile_service, None)
    app.dependency_overrides.pop(get_settings, None)


def use_token(token):
    app.dependency_overrides[get_settings] = lambda: settings_with_token(token)


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_data_routes_are_disabled_without_a_configured_token(client, route):
    use_token(None)
    response = client.get(route, headers={"Authorization": "Bearer anything-at-all-0123456789abcdef"})
    assert response.status_code == 503
    assert "09170000099" not in response.text


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_a_short_configured_token_keeps_routes_disabled(client, route):
    use_token("short")
    assert client.get(route, headers={"Authorization": "Bearer short"}).status_code == 503


@pytest.mark.parametrize("route", DATA_ROUTES)
def test_no_credentials_is_refused(client, route):
    use_token(TEST_ADMIN_TOKEN)
    response = client.get(route)
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


@pytest.mark.parametrize("header", ["Bearer wrong-token-0123456789abcdefghij", f"Basic {TEST_ADMIN_TOKEN}", TEST_ADMIN_TOKEN,
                                    f"Bearer {TEST_ADMIN_TOKEN}x", "Bearer "])
def test_wrong_credentials_are_refused(client, header):
    use_token(TEST_ADMIN_TOKEN)
    response = client.get("/api/v1/profiles", headers={"Authorization": header})
    assert response.status_code == 401
    assert "09170000099" not in response.text


def test_operator_token_lists_profiles(client):
    use_token(TEST_ADMIN_TOKEN)
    response = client.get("/api/v1/profiles", headers={"Authorization": f"Bearer {TEST_ADMIN_TOKEN}"})
    assert response.status_code == 200
    assert response.json()["data"][0]["phone_number"] == "09170000099"


def test_health_stays_public(client):
    use_token(None)
    assert client.get("/api/v1/health").status_code == 200


def test_debug_is_off_by_default():
    assert get_settings().debug is False or "APP_DEBUG" in __import__("os").environ
