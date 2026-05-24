import os
import sys

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.config import get_settings  # noqa: E402
from app.models.base import Base  # noqa: E402

config = context.config
fileConfig(config.config_file_name)

settings = get_settings()
# Convert asyncpg URL to psycopg for Alembic (which requires sync driver)
database_url = str(settings.database_url)
if database_url.startswith("postgresql+asyncpg://"):
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql+psycopg://")
config.set_main_option('sqlalchemy.url', database_url)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix='sqlalchemy.',
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    raise NotImplementedError("Offline migrations are not supported.")

run_migrations_online()
