"""add reminder execution queue

Revision ID: s5d2e7b1c4a8
Revises: r5e1d2c4a8b7
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s5d2e7b1c4a8"
down_revision: Union[str, Sequence[str], None] = "r5e1d2c4a8b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "reminder_execution_queue_items" not in existing_tables:
        op.create_table(
            "reminder_execution_queue_items",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("reminder_id", sa.UUID(), nullable=False),
            sa.Column("execution_key", sa.String(), nullable=False),
            sa.Column("trigger_source", sa.String(), nullable=False, server_default="reminder_execution_engine"),
            sa.Column("status", sa.String(), nullable=False, server_default="queued"),
            sa.Column("eligibility_reason", sa.String(), nullable=True),
            sa.Column("scheduled_for", sa.DateTime(), nullable=True),
            sa.Column("evaluated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("queued_at", sa.DateTime(), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("next_retry_at", sa.DateTime(), nullable=True),
            sa.Column("last_error", sa.String(), nullable=True),
            sa.Column("execution_payload", sa.JSON(), nullable=True),
            sa.Column("queue_metadata", sa.JSON(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["reminder_id"], ["reminder_definitions.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("execution_key", name="uq_reminder_execution_queue_items_execution_key"),
        )

    inspector = sa.inspect(bind)
    if "reminder_execution_queue_items" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "reminder_execution_queue_items")
        if "ix_reminder_execution_queue_items_reminder_id" not in indexes:
            op.create_index("ix_reminder_execution_queue_items_reminder_id", "reminder_execution_queue_items", ["reminder_id"], unique=False)
        if "ix_reminder_execution_queue_items_execution_key" not in indexes:
            op.create_index("ix_reminder_execution_queue_items_execution_key", "reminder_execution_queue_items", ["execution_key"], unique=True)
        if "ix_reminder_execution_queue_items_trigger_source" not in indexes:
            op.create_index("ix_reminder_execution_queue_items_trigger_source", "reminder_execution_queue_items", ["trigger_source"], unique=False)
        if "ix_reminder_execution_queue_items_status" not in indexes:
            op.create_index("ix_reminder_execution_queue_items_status", "reminder_execution_queue_items", ["status"], unique=False)
        if "ix_reminder_execution_queue_items_scheduled_for" not in indexes:
            op.create_index("ix_reminder_execution_queue_items_scheduled_for", "reminder_execution_queue_items", ["scheduled_for"], unique=False)
        if "ix_reminder_execution_queue_items_next_retry_at" not in indexes:
            op.create_index("ix_reminder_execution_queue_items_next_retry_at", "reminder_execution_queue_items", ["next_retry_at"], unique=False)
        if "ix_reminder_execution_queue_items_created_at" not in indexes:
            op.create_index("ix_reminder_execution_queue_items_created_at", "reminder_execution_queue_items", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "reminder_execution_queue_items" in existing_tables:
        indexes = _index_names(inspector, "reminder_execution_queue_items")
        if "ix_reminder_execution_queue_items_created_at" in indexes:
            op.drop_index("ix_reminder_execution_queue_items_created_at", table_name="reminder_execution_queue_items")
        if "ix_reminder_execution_queue_items_next_retry_at" in indexes:
            op.drop_index("ix_reminder_execution_queue_items_next_retry_at", table_name="reminder_execution_queue_items")
        if "ix_reminder_execution_queue_items_scheduled_for" in indexes:
            op.drop_index("ix_reminder_execution_queue_items_scheduled_for", table_name="reminder_execution_queue_items")
        if "ix_reminder_execution_queue_items_status" in indexes:
            op.drop_index("ix_reminder_execution_queue_items_status", table_name="reminder_execution_queue_items")
        if "ix_reminder_execution_queue_items_trigger_source" in indexes:
            op.drop_index("ix_reminder_execution_queue_items_trigger_source", table_name="reminder_execution_queue_items")
        if "ix_reminder_execution_queue_items_execution_key" in indexes:
            op.drop_index("ix_reminder_execution_queue_items_execution_key", table_name="reminder_execution_queue_items")
        if "ix_reminder_execution_queue_items_reminder_id" in indexes:
            op.drop_index("ix_reminder_execution_queue_items_reminder_id", table_name="reminder_execution_queue_items")
        op.drop_table("reminder_execution_queue_items")