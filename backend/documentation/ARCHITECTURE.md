# WashLink Backend Architecture

## Purpose

This backend repository is designed to host WashLink server-side services and AI workloads separately from the frontend. The backend supports:

- REST API endpoints
- asynchronous business logic
- database repositories
- background workers and AI pipelines
- environment-based deployment

## Design Principles

- Clean Architecture
- Separation of Concerns
- Service layer pattern
- Repository pattern
- Dependency injection
- Strict typing with Pydantic

## Initial Service Contract

### `GET /api/v1/health`

Returns:
- `success`: boolean
- `message`: string
- `data`: object with application status

### `GET /api/v1/bookings`

Returns:
- `success`: boolean
- `data`: array of bookings
- `message`: string

This contract is intentionally lightweight and establishes a stable API surface for frontend and mobile clients.

## Future expansion

The backend scaffold is ready for:

- PostgreSQL via SQLAlchemy
- Alembic migrations
- Redis caching and queues
- Celery background workers
- AI/vector modules under `app/ai/` and `app/vector/`
