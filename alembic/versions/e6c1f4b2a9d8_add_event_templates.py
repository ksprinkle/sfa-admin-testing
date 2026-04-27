"""add event templates

Revision ID: e6c1f4b2a9d8
Revises: d8a7b1e4c2f9, 3d1374d0b4f5
Create Date: 2026-04-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6c1f4b2a9d8"
down_revision: Union[str, Sequence[str], None] = ("d8a7b1e4c2f9", "3d1374d0b4f5")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "event_templates" not in existing_tables:
        op.create_table(
            "event_templates",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("location", sa.String(), nullable=False),
            sa.Column("capacity", sa.Integer(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("default_start_time", sa.Time(), nullable=False),
            sa.Column("default_end_time", sa.Time(), nullable=False),
            sa.Column("session_count", sa.Integer(), nullable=False),
            sa.Column("session_capacity", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "event_templates" in existing_tables:
        op.drop_table("event_templates")