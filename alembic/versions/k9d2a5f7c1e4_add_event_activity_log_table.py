"""add event activity log table

Revision ID: k9d2a5f7c1e4
Revises: h2c4e6f8a1b0
Create Date: 2026-04-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k9d2a5f7c1e4"
down_revision: Union[str, Sequence[str], None] = "h2c4e6f8a1b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "event_activity_logs" not in existing_tables:
        op.create_table(
            "event_activity_logs",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("event_id", sa.String(), nullable=False),
            sa.Column("event_title", sa.String(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=True),
            sa.Column("action_type", sa.String(), nullable=False),
            sa.Column("previous_status", sa.String(), nullable=True),
            sa.Column("new_status", sa.String(), nullable=True),
            sa.Column("reason_code", sa.String(), nullable=True),
            sa.Column("reason_note", sa.String(), nullable=True),
            sa.Column("actor_user_id", sa.String(), nullable=True),
            sa.Column("actor_user_email", sa.String(), nullable=True),
            sa.Column("participant_count", sa.Integer(), nullable=True),
            sa.Column("waitlist_count", sa.Integer(), nullable=True),
            sa.Column("checked_in_count", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    indexes = {
        idx["name"]
        for idx in inspector.get_indexes("event_activity_logs")
    }

    if "ix_event_activity_logs_event_id" not in indexes:
        op.create_index("ix_event_activity_logs_event_id", "event_activity_logs", ["event_id"], unique=False)
    if "ix_event_activity_logs_event_type" not in indexes:
        op.create_index("ix_event_activity_logs_event_type", "event_activity_logs", ["event_type"], unique=False)
    if "ix_event_activity_logs_action_type" not in indexes:
        op.create_index("ix_event_activity_logs_action_type", "event_activity_logs", ["action_type"], unique=False)
    if "ix_event_activity_logs_new_status" not in indexes:
        op.create_index("ix_event_activity_logs_new_status", "event_activity_logs", ["new_status"], unique=False)
    if "ix_event_activity_logs_reason_code" not in indexes:
        op.create_index("ix_event_activity_logs_reason_code", "event_activity_logs", ["reason_code"], unique=False)
    if "ix_event_activity_logs_actor_user_email" not in indexes:
        op.create_index("ix_event_activity_logs_actor_user_email", "event_activity_logs", ["actor_user_email"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "event_activity_logs" not in existing_tables:
        return

    indexes = {
        idx["name"]
        for idx in inspector.get_indexes("event_activity_logs")
    }

    for index_name in [
        "ix_event_activity_logs_event_id",
        "ix_event_activity_logs_event_type",
        "ix_event_activity_logs_action_type",
        "ix_event_activity_logs_new_status",
        "ix_event_activity_logs_reason_code",
        "ix_event_activity_logs_actor_user_email",
    ]:
        if index_name in indexes:
            op.drop_index(index_name, table_name="event_activity_logs")

    op.drop_table("event_activity_logs")
