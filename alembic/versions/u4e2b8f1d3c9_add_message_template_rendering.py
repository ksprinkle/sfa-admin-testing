"""add message template and rendering foundation

Revision ID: u4e2b8f1d3c9
Revises: t3f1a9d6c2e4
Create Date: 2026-06-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "u4e2b8f1d3c9"
down_revision: Union[str, Sequence[str], None] = "t3f1a9d6c2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # Create message_templates first (no FK to versions yet — active_version_id
    # is added after versions table exists to avoid circular dependency).
    if "message_templates" not in existing_tables:
        op.create_table(
            "message_templates",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("template_key", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=False),
            sa.Column("supported_channels", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("active_version_id", sa.UUID(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("template_key", name="uq_message_templates_template_key"),
        )

    inspector = sa.inspect(bind)
    if "message_templates" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "message_templates")
        for idx_name, columns, unique in [
            ("ix_message_templates_template_key", ["template_key"], True),
            ("ix_message_templates_category", ["category"], False),
            ("ix_message_templates_status", ["status"], False),
            ("ix_message_templates_created_at", ["created_at"], False),
        ]:
            if idx_name not in indexes:
                op.create_index(idx_name, "message_templates", columns, unique=unique)

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "message_template_versions" not in existing_tables:
        op.create_table(
            "message_template_versions",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("template_id", sa.UUID(), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("subject_pattern", sa.String(), nullable=True),
            sa.Column("body_pattern", sa.Text(), nullable=False),
            sa.Column("variable_definitions", sa.JSON(), nullable=False),
            sa.Column("rendering_hints", sa.JSON(), nullable=True),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["template_id"], ["message_templates.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "message_template_versions" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "message_template_versions")
        for idx_name, columns, unique in [
            ("ix_message_template_versions_template_id", ["template_id"], False),
            ("ix_message_template_versions_version_number", ["version_number"], False),
            ("ix_message_template_versions_status", ["status"], False),
            ("ix_message_template_versions_created_at", ["created_at"], False),
        ]:
            if idx_name not in indexes:
                op.create_index(idx_name, "message_template_versions", columns, unique=unique)

    # Add deferred FK from message_templates.active_version_id → message_template_versions.id
    # Only needed if both tables now exist and the FK is not already present.
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "message_templates" in existing_tables and "message_template_versions" in existing_tables:
        existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("message_templates")}
        if "fk_message_templates_active_version" not in existing_fks:
            with op.batch_alter_table("message_templates") as batch_op:
                batch_op.create_foreign_key(
                    "fk_message_templates_active_version",
                    "message_template_versions",
                    ["active_version_id"],
                    ["id"],
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # Remove deferred FK first
    if "message_templates" in existing_tables:
        existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("message_templates")}
        if "fk_message_templates_active_version" in existing_fks:
            with op.batch_alter_table("message_templates") as batch_op:
                batch_op.drop_constraint("fk_message_templates_active_version", type_="foreignkey")

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "message_template_versions" in existing_tables:
        indexes = _index_names(inspector, "message_template_versions")
        for idx_name in [
            "ix_message_template_versions_created_at",
            "ix_message_template_versions_status",
            "ix_message_template_versions_version_number",
            "ix_message_template_versions_template_id",
        ]:
            if idx_name in indexes:
                op.drop_index(idx_name, table_name="message_template_versions")
        op.drop_table("message_template_versions")

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "message_templates" in existing_tables:
        indexes = _index_names(inspector, "message_templates")
        for idx_name in [
            "ix_message_templates_created_at",
            "ix_message_templates_status",
            "ix_message_templates_category",
            "ix_message_templates_template_key",
        ]:
            if idx_name in indexes:
                op.drop_index(idx_name, table_name="message_templates")
        op.drop_table("message_templates")
