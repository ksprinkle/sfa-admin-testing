"""add requires assistance to participants

Revision ID: m1a2b3c4d5e6
Revises: k9d2a5f7c1e4
Create Date: 2026-04-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "k9d2a5f7c1e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("participants")}

    if "requires_assistance" not in columns:
        op.add_column(
            "participants",
            sa.Column("requires_assistance", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("participants")}

    if "requires_assistance" in columns:
        op.drop_column("participants", "requires_assistance")