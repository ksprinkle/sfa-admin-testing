"""add notification delivery pipeline

Revision ID: t3f1a9d6c2e4
Revises: s5d2e7b1c4a8
Create Date: 2026-06-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "t3f1a9d6c2e4"
down_revision: Union[str, Sequence[str], None] = "s5d2e7b1c4a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "notification_delivery_attempts" not in existing_tables:
        op.create_table(
            "notification_delivery_attempts",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("delivery_key", sa.String(), nullable=False),
            sa.Column("source_domain", sa.String(), nullable=False),
            sa.Column("source_id", sa.String(), nullable=True),
            sa.Column("execution_queue_item_id", sa.UUID(), nullable=True),
            sa.Column("channel", sa.String(), nullable=False),
            sa.Column("recipient", sa.String(), nullable=False),
            sa.Column("provider_key", sa.String(), nullable=False, server_default="noop"),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("scheduled_for", sa.DateTime(), nullable=True),
            sa.Column("next_retry_at", sa.DateTime(), nullable=True),
            sa.Column("failure_reason", sa.String(), nullable=True),
            sa.Column("provider_message_id", sa.String(), nullable=True),
            sa.Column("delivery_payload", sa.JSON(), nullable=True),
            sa.Column("delivery_metadata", sa.JSON(), nullable=True),
            sa.Column("delivered_at", sa.DateTime(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(
                ["execution_queue_item_id"],
                ["reminder_execution_queue_items.id"],
                ondelete="SET NULL",
            ),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("delivery_key", name="uq_notification_delivery_attempts_delivery_key"),
        )

    inspector = sa.inspect(bind)
    if "notification_delivery_attempts" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "notification_delivery_attempts")
        for idx_name, columns, unique in [
            ("ix_notification_delivery_attempts_delivery_key", ["delivery_key"], True),
            ("ix_notification_delivery_attempts_source_domain", ["source_domain"], False),
            ("ix_notification_delivery_attempts_source_id", ["source_id"], False),
            ("ix_notification_delivery_attempts_execution_queue_item_id", ["execution_queue_item_id"], False),
            ("ix_notification_delivery_attempts_channel", ["channel"], False),
            ("ix_notification_delivery_attempts_provider_key", ["provider_key"], False),
            ("ix_notification_delivery_attempts_status", ["status"], False),
            ("ix_notification_delivery_attempts_scheduled_for", ["scheduled_for"], False),
            ("ix_notification_delivery_attempts_next_retry_at", ["next_retry_at"], False),
            ("ix_notification_delivery_attempts_created_at", ["created_at"], False),
        ]:
            if idx_name not in indexes:
                op.create_index(idx_name, "notification_delivery_attempts", columns, unique=unique)

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "notification_delivery_events" not in existing_tables:
        op.create_table(
            "notification_delivery_events",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("delivery_attempt_id", sa.UUID(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("source", sa.String(), nullable=True, server_default="notification_pipeline"),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(
                ["delivery_attempt_id"],
                ["notification_delivery_attempts.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "notification_delivery_events" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "notification_delivery_events")
        for idx_name, columns, unique in [
            ("ix_notification_delivery_events_delivery_attempt_id", ["delivery_attempt_id"], False),
            ("ix_notification_delivery_events_event_type", ["event_type"], False),
            ("ix_notification_delivery_events_created_at", ["created_at"], False),
        ]:
            if idx_name not in indexes:
                op.create_index(idx_name, "notification_delivery_events", columns, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "notification_delivery_events" in existing_tables:
        indexes = _index_names(inspector, "notification_delivery_events")
        for idx_name in [
            "ix_notification_delivery_events_created_at",
            "ix_notification_delivery_events_event_type",
            "ix_notification_delivery_events_delivery_attempt_id",
        ]:
            if idx_name in indexes:
                op.drop_index(idx_name, table_name="notification_delivery_events")
        op.drop_table("notification_delivery_events")

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "notification_delivery_attempts" in existing_tables:
        indexes = _index_names(inspector, "notification_delivery_attempts")
        for idx_name in [
            "ix_notification_delivery_attempts_created_at",
            "ix_notification_delivery_attempts_next_retry_at",
            "ix_notification_delivery_attempts_scheduled_for",
            "ix_notification_delivery_attempts_status",
            "ix_notification_delivery_attempts_provider_key",
            "ix_notification_delivery_attempts_channel",
            "ix_notification_delivery_attempts_execution_queue_item_id",
            "ix_notification_delivery_attempts_source_id",
            "ix_notification_delivery_attempts_source_domain",
            "ix_notification_delivery_attempts_delivery_key",
        ]:
            if idx_name in indexes:
                op.drop_index(idx_name, table_name="notification_delivery_attempts")
        op.drop_table("notification_delivery_attempts")
