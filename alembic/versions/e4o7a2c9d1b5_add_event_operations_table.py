"""add event operations table

Revision ID: e4o7a2c9d1b5
Revises: c4m6e8d1b3a9
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4o7a2c9d1b5"
down_revision: Union[str, Sequence[str], None] = "c4m6e8d1b3a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "event_operations" not in existing_tables:
        op.create_table(
            "event_operations",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("event_id", sa.UUID(), nullable=False),
            sa.Column("operational_status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("readiness_status", sa.String(), nullable=False, server_default="not_ready"),
            sa.Column("capacity_status", sa.String(), nullable=False, server_default="unknown"),
            sa.Column("participant_capacity", sa.Integer(), nullable=True),
            sa.Column("participant_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("volunteer_capacity", sa.Integer(), nullable=True),
            sa.Column("volunteer_assignment_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("readiness_score", sa.Float(), nullable=False, server_default="0"),
            sa.Column("blockers", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("event_id", name="uq_event_operations_event_id"),
        )

    inspector = sa.inspect(bind)
    if "event_operations" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "event_operations")
        if "ix_event_operations_event_id" not in indexes:
            op.create_index("ix_event_operations_event_id", "event_operations", ["event_id"], unique=True)
        if "ix_event_operations_operational_status" not in indexes:
            op.create_index("ix_event_operations_operational_status", "event_operations", ["operational_status"], unique=False)
        if "ix_event_operations_readiness_status" not in indexes:
            op.create_index("ix_event_operations_readiness_status", "event_operations", ["readiness_status"], unique=False)
        if "ix_event_operations_capacity_status" not in indexes:
            op.create_index("ix_event_operations_capacity_status", "event_operations", ["capacity_status"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "event_operations" not in existing_tables:
        return

    indexes = _index_names(inspector, "event_operations")
    if "ix_event_operations_capacity_status" in indexes:
        op.drop_index("ix_event_operations_capacity_status", table_name="event_operations")
    if "ix_event_operations_readiness_status" in indexes:
        op.drop_index("ix_event_operations_readiness_status", table_name="event_operations")
    if "ix_event_operations_operational_status" in indexes:
        op.drop_index("ix_event_operations_operational_status", table_name="event_operations")
    if "ix_event_operations_event_id" in indexes:
        op.drop_index("ix_event_operations_event_id", table_name="event_operations")

    op.drop_table("event_operations")