"""Generic Python migration template."""
from __future__ import annotations

revision = "${up_revision}"
down_revision = ${down_revision | None!r}
branch_labels = ${branch_labels!r}
depends_on = ${depends_on!r}

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
