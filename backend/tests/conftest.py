import pytest

from app.core.config import Settings, get_settings
from app.main import app

# Synthetic test token, only ever used in-process by these tests.
TEST_ADMIN_TOKEN = "test-operator-token-0123456789abcdef"


def settings_with_token(token: str | None) -> Settings:
    return Settings(admin_api_token=token)


@pytest.fixture
def operator_headers():
    app.dependency_overrides[get_settings] = lambda: settings_with_token(TEST_ADMIN_TOKEN)
    yield {"Authorization": f"Bearer {TEST_ADMIN_TOKEN}"}
    app.dependency_overrides.pop(get_settings, None)
