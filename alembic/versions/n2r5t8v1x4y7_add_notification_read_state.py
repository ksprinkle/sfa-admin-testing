"""add notification read state table

Revision ID: n2r5t8v1x4y7
Revises: e4b3eb4e262d
Create Date: 2026-07-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n2r5t8v1x4y7"
down_revision: Union[str, Sequence[str], None] = "e4b3eb4e262d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "notification_read_state" not in existing_tables:
        op.create_table(
            "notification_read_state",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("notification_key", sa.String(), nullable=False),
            sa.Column("read_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "notification_key", name="uq_notification_read_state_user_key"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "notification_read_state" in existing_tables:
        op.drop_table("notification_read_state")
