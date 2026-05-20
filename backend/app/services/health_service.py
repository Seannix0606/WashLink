from app.schemas.health import HealthResponse


class HealthService:
    def get_status(self) -> HealthResponse:
        return HealthResponse(
            success=True,
            message="Application is healthy.",
            data={"status": "ok"},
        )
