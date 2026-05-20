# WashLink Backend

This repository contains the backend API scaffold for WashLink, built to support:
- FastAPI request handling
- Clean Architecture
- service/repository separation
- environment-based configuration
- async patterns and future AI workloads

## Structure

- `app/` - application code
- `app/api/` - API routers and request handling
- `app/services/` - business logic
- `app/repositories/` - data access interfaces and implementations
- `app/schemas/` - request and response models
- `app/core/` - configuration, logging, and shared infrastructure
- `tests/` - unit tests
- `migrations/` - database migration management
- `documentation/` - backend architecture documentation

## Getting Started

1. Create a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and update values.
4. Apply the initial database migration:
   ```bash
   alembic upgrade head
   ```
5. Seed initial sample data (optional):
   ```bash
   python scripts/seed_initial_data.py
   ```
6. Start the application:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

## First API Contract

The first FastAPI endpoints implement health, booking, profile, shop, and worker list contracts using typed schemas.

- `GET /api/v1/health`
- `GET /api/v1/bookings`
- `GET /api/v1/profiles`
- `GET /api/v1/shops`
- `GET /api/v1/workers`

These endpoints demonstrate a thin controller layer, a dedicated service layer, and explicit dependency injection.

## Database Integration

The backend uses SQLAlchemy async sessions to connect to Supabase Postgres via the `DATABASE_URL` environment variable. Data access is isolated inside repository implementations.
