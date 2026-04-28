"""add date to event templates

Revision ID: h2c4e6f8a1b0
Revises: g7e2d4f8b9c3a
Create Date: 2026-04-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h2c4e6f8a1b0"
down_revision: Union[str, Sequence[str], None] = "g7e2d4f8b9c3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    template_columns = set(col["name"] for col in inspector.get_columns("event_templates"))

    if "date" not in template_columns:
        op.add_column("event_templates", sa.Column("date", sa.Date(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    template_columns = set(col["name"] for col in inspector.get_columns("event_templates"))

    if "date" in template_columns:
        op.drop_column("event_templates", "date")
