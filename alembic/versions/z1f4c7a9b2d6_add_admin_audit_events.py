"""add admin audit events

Revision ID: z1f4c7a9b2d6
Revises: y7c1e5d9a2b4
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "z1f4c7a9b2d6"
down_revision: Union[str, Sequence[str], None] = "y7c1e5d9a2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "admin_audit_events" not in existing_tables:
        op.create_table(
            "admin_audit_events",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("domain", sa.String(), nullable=False),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("actor_user_id", sa.String(), nullable=True),
            sa.Column("target_type", sa.String(), nullable=True),
            sa.Column("target_id", sa.String(), nullable=True),
            sa.Column("target_display", sa.String(), nullable=True),
            sa.Column("source", sa.String(), nullable=True, server_default="admin_api"),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "admin_audit_events" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "admin_audit_events")
        if "ix_admin_audit_events_domain" not in indexes:
            op.create_index("ix_admin_audit_events_domain", "admin_audit_events", ["domain"], unique=False)
        if "ix_admin_audit_events_action" not in indexes:
            op.create_index("ix_admin_audit_events_action", "admin_audit_events", ["action"], unique=False)
        if "ix_admin_audit_events_actor_user_id" not in indexes:
            op.create_index("ix_admin_audit_events_actor_user_id", "admin_audit_events", ["actor_user_id"], unique=False)
        if "ix_admin_audit_events_target_type" not in indexes:
            op.create_index("ix_admin_audit_events_target_type", "admin_audit_events", ["target_type"], unique=False)
        if "ix_admin_audit_events_target_id" not in indexes:
            op.create_index("ix_admin_audit_events_target_id", "admin_audit_events", ["target_id"], unique=False)
        if "ix_admin_audit_events_created_at" not in indexes:
            op.create_index("ix_admin_audit_events_created_at", "admin_audit_events", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "admin_audit_events" not in existing_tables:
        return

    indexes = _index_names(inspector, "admin_audit_events")
    if "ix_admin_audit_events_created_at" in indexes:
        op.drop_index("ix_admin_audit_events_created_at", table_name="admin_audit_events")
    if "ix_admin_audit_events_target_id" in indexes:
        op.drop_index("ix_admin_audit_events_target_id", table_name="admin_audit_events")
    if "ix_admin_audit_events_target_type" in indexes:
        op.drop_index("ix_admin_audit_events_target_type", table_name="admin_audit_events")
    if "ix_admin_audit_events_actor_user_id" in indexes:
        op.drop_index("ix_admin_audit_events_actor_user_id", table_name="admin_audit_events")
    if "ix_admin_audit_events_action" in indexes:
        op.drop_index("ix_admin_audit_events_action", table_name="admin_audit_events")
    if "ix_admin_audit_events_domain" in indexes:
        op.drop_index("ix_admin_audit_events_domain", table_name="admin_audit_events")

    op.drop_table("admin_audit_events")