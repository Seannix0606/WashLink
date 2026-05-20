from fastapi.testclient import TestClient

from app.main import app


def test_list_bookings_returns_expected_contract() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/bookings")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert isinstance(payload["data"], list)
    assert payload["message"] == "Bookings retrieved successfully"
    assert payload["data"] and payload["data"][0]["status"] == "pending"
