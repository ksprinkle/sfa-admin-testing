"""add communications foundation tables

Revision ID: c4m6e8d1b3a9
Revises: v4p5c3d9e1a7
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4m6e8d1b3a9"
down_revision: Union[str, Sequence[str], None] = "v4p5c3d9e1a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "communication_templates" not in existing_tables:
        op.create_table(
            "communication_templates",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("template_key", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("channel", sa.String(), nullable=False, server_default="email"),
            sa.Column("subject_template", sa.String(), nullable=True),
            sa.Column("body_template", sa.Text(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("template_key", name="uq_communication_templates_template_key"),
        )

    inspector = sa.inspect(bind)
    if "communication_templates" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "communication_templates")
        if "ix_communication_templates_template_key" not in indexes:
            op.create_index("ix_communication_templates_template_key", "communication_templates", ["template_key"], unique=True)
        if "ix_communication_templates_channel" not in indexes:
            op.create_index("ix_communication_templates_channel", "communication_templates", ["channel"], unique=False)

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "communication_messages" not in existing_tables:
        op.create_table(
            "communication_messages",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("template_id", sa.UUID(), nullable=True),
            sa.Column("channel", sa.String(), nullable=False),
            sa.Column("audience_type", sa.String(), nullable=False, server_default="manual"),
            sa.Column("audience_filter", sa.JSON(), nullable=True),
            sa.Column("subject", sa.String(), nullable=True),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["template_id"], ["communication_templates.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "communication_messages" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "communication_messages")
        if "ix_communication_messages_template_id" not in indexes:
            op.create_index("ix_communication_messages_template_id", "communication_messages", ["template_id"], unique=False)
        if "ix_communication_messages_channel" not in indexes:
            op.create_index("ix_communication_messages_channel", "communication_messages", ["channel"], unique=False)
        if "ix_communication_messages_status" not in indexes:
            op.create_index("ix_communication_messages_status", "communication_messages", ["status"], unique=False)
        if "ix_communication_messages_created_at" not in indexes:
            op.create_index("ix_communication_messages_created_at", "communication_messages", ["created_at"], unique=False)

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "communication_deliveries" not in existing_tables:
        op.create_table(
            "communication_deliveries",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("message_id", sa.UUID(), nullable=False),
            sa.Column("channel", sa.String(), nullable=False),
            sa.Column("recipient", sa.String(), nullable=False),
            sa.Column("provider_key", sa.String(), nullable=False, server_default="noop"),
            sa.Column("provider_message_id", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="queued"),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["message_id"], ["communication_messages.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "communication_deliveries" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "communication_deliveries")
        if "ix_communication_deliveries_message_id" not in indexes:
            op.create_index("ix_communication_deliveries_message_id", "communication_deliveries", ["message_id"], unique=False)
        if "ix_communication_deliveries_channel" not in indexes:
            op.create_index("ix_communication_deliveries_channel", "communication_deliveries", ["channel"], unique=False)
        if "ix_communication_deliveries_status" not in indexes:
            op.create_index("ix_communication_deliveries_status", "communication_deliveries", ["status"], unique=False)
        if "ix_communication_deliveries_created_at" not in indexes:
            op.create_index("ix_communication_deliveries_created_at", "communication_deliveries", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "communication_deliveries" in existing_tables:
        indexes = _index_names(inspector, "communication_deliveries")
        if "ix_communication_deliveries_created_at" in indexes:
            op.drop_index("ix_communication_deliveries_created_at", table_name="communication_deliveries")
        if "ix_communication_deliveries_status" in indexes:
            op.drop_index("ix_communication_deliveries_status", table_name="communication_deliveries")
        if "ix_communication_deliveries_channel" in indexes:
            op.drop_index("ix_communication_deliveries_channel", table_name="communication_deliveries")
        if "ix_communication_deliveries_message_id" in indexes:
            op.drop_index("ix_communication_deliveries_message_id", table_name="communication_deliveries")
        op.drop_table("communication_deliveries")

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "communication_messages" in existing_tables:
        indexes = _index_names(inspector, "communication_messages")
        if "ix_communication_messages_created_at" in indexes:
            op.drop_index("ix_communication_messages_created_at", table_name="communication_messages")
        if "ix_communication_messages_status" in indexes:
            op.drop_index("ix_communication_messages_status", table_name="communication_messages")
        if "ix_communication_messages_channel" in indexes:
            op.drop_index("ix_communication_messages_channel", table_name="communication_messages")
        if "ix_communication_messages_template_id" in indexes:
            op.drop_index("ix_communication_messages_template_id", table_name="communication_messages")
        op.drop_table("communication_messages")

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "communication_templates" in existing_tables:
        indexes = _index_names(inspector, "communication_templates")
        if "ix_communication_templates_channel" in indexes:
            op.drop_index("ix_communication_templates_channel", table_name="communication_templates")
        if "ix_communication_templates_template_key" in indexes:
            op.drop_index("ix_communication_templates_template_key", table_name="communication_templates")
        op.drop_table("communication_templates")