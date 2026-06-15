"""add reminder foundation

Revision ID: r5e1d2c4a8b7
Revises: p4a4f1d8c2b7
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r5e1d2c4a8b7"
down_revision: Union[str, Sequence[str], None] = "p4a4f1d8c2b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "reminder_definitions" not in existing_tables:
        op.create_table(
            "reminder_definitions",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("reminder_key", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("target_domain", sa.String(), nullable=False),
            sa.Column("trigger_type", sa.String(), nullable=False, server_default="manual"),
            sa.Column("trigger_config", sa.JSON(), nullable=True),
            sa.Column("schedule_config", sa.JSON(), nullable=True),
            sa.Column("notification_channels", sa.JSON(), nullable=False),
            sa.Column("notification_template_key", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("reminder_key", name="uq_reminder_definitions_reminder_key"),
        )

    inspector = sa.inspect(bind)
    if "reminder_definitions" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "reminder_definitions")
        if "ix_reminder_definitions_reminder_key" not in indexes:
            op.create_index("ix_reminder_definitions_reminder_key", "reminder_definitions", ["reminder_key"], unique=True)
        if "ix_reminder_definitions_target_domain" not in indexes:
            op.create_index("ix_reminder_definitions_target_domain", "reminder_definitions", ["target_domain"], unique=False)
        if "ix_reminder_definitions_trigger_type" not in indexes:
            op.create_index("ix_reminder_definitions_trigger_type", "reminder_definitions", ["trigger_type"], unique=False)
        if "ix_reminder_definitions_notification_template_key" not in indexes:
            op.create_index("ix_reminder_definitions_notification_template_key", "reminder_definitions", ["notification_template_key"], unique=False)
        if "ix_reminder_definitions_is_active" not in indexes:
            op.create_index("ix_reminder_definitions_is_active", "reminder_definitions", ["is_active"], unique=False)
        if "ix_reminder_definitions_created_at" not in indexes:
            op.create_index("ix_reminder_definitions_created_at", "reminder_definitions", ["created_at"], unique=False)

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "reminder_audit_events" not in existing_tables:
        op.create_table(
            "reminder_audit_events",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("reminder_id", sa.UUID(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("actor_user_id", sa.String(), nullable=True),
            sa.Column("source", sa.String(), nullable=True, server_default="reminder_api"),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["reminder_id"], ["reminder_definitions.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "reminder_audit_events" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "reminder_audit_events")
        if "ix_reminder_audit_events_reminder_id" not in indexes:
            op.create_index("ix_reminder_audit_events_reminder_id", "reminder_audit_events", ["reminder_id"], unique=False)
        if "ix_reminder_audit_events_event_type" not in indexes:
            op.create_index("ix_reminder_audit_events_event_type", "reminder_audit_events", ["event_type"], unique=False)
        if "ix_reminder_audit_events_actor_user_id" not in indexes:
            op.create_index("ix_reminder_audit_events_actor_user_id", "reminder_audit_events", ["actor_user_id"], unique=False)
        if "ix_reminder_audit_events_created_at" not in indexes:
            op.create_index("ix_reminder_audit_events_created_at", "reminder_audit_events", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "reminder_audit_events" in existing_tables:
        indexes = _index_names(inspector, "reminder_audit_events")
        if "ix_reminder_audit_events_created_at" in indexes:
            op.drop_index("ix_reminder_audit_events_created_at", table_name="reminder_audit_events")
        if "ix_reminder_audit_events_actor_user_id" in indexes:
            op.drop_index("ix_reminder_audit_events_actor_user_id", table_name="reminder_audit_events")
        if "ix_reminder_audit_events_event_type" in indexes:
            op.drop_index("ix_reminder_audit_events_event_type", table_name="reminder_audit_events")
        if "ix_reminder_audit_events_reminder_id" in indexes:
            op.drop_index("ix_reminder_audit_events_reminder_id", table_name="reminder_audit_events")
        op.drop_table("reminder_audit_events")

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "reminder_definitions" in existing_tables:
        indexes = _index_names(inspector, "reminder_definitions")
        if "ix_reminder_definitions_created_at" in indexes:
            op.drop_index("ix_reminder_definitions_created_at", table_name="reminder_definitions")
        if "ix_reminder_definitions_is_active" in indexes:
            op.drop_index("ix_reminder_definitions_is_active", table_name="reminder_definitions")
        if "ix_reminder_definitions_notification_template_key" in indexes:
            op.drop_index("ix_reminder_definitions_notification_template_key", table_name="reminder_definitions")
        if "ix_reminder_definitions_trigger_type" in indexes:
            op.drop_index("ix_reminder_definitions_trigger_type", table_name="reminder_definitions")
        if "ix_reminder_definitions_target_domain" in indexes:
            op.drop_index("ix_reminder_definitions_target_domain", table_name="reminder_definitions")
        if "ix_reminder_definitions_reminder_key" in indexes:
            op.drop_index("ix_reminder_definitions_reminder_key", table_name="reminder_definitions")
        op.drop_table("reminder_definitions")