# Migrations

This directory is reserved for Alembic migration scripts.

Use Alembic to manage schema changes when adding the relational data model.

Example commands:

```bash
alembic init migrations
alembic revision --autogenerate -m "create bookings table"
alembic upgrade head
```
