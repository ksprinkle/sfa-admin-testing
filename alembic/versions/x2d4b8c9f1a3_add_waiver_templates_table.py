"""add waiver templates table

Revision ID: x2d4b8c9f1a3
Revises: w6f3b2d8a9c1
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "x2d4b8c9f1a3"
down_revision: Union[str, Sequence[str], None] = "w6f3b2d8a9c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_templates" not in existing_tables:
        op.create_table(
            "waiver_templates",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("supersedes_template_id", sa.UUID(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("activated_by_user_id", sa.String(), nullable=True),
            sa.Column("archived_by_user_id", sa.String(), nullable=True),
            sa.Column("activated_at", sa.DateTime(), nullable=True),
            sa.Column("archived_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["supersedes_template_id"], ["waiver_templates.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["activated_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["archived_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("version", name="uq_waiver_templates_version"),
        )

    inspector = sa.inspect(bind)
    if "waiver_templates" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "waiver_templates")
        if "ix_waiver_templates_version" not in indexes:
            op.create_index("ix_waiver_templates_version", "waiver_templates", ["version"], unique=True)
        if "ix_waiver_templates_status" not in indexes:
            op.create_index("ix_waiver_templates_status", "waiver_templates", ["status"], unique=False)
        if "ix_waiver_templates_supersedes_template_id" not in indexes:
            op.create_index(
                "ix_waiver_templates_supersedes_template_id",
                "waiver_templates",
                ["supersedes_template_id"],
                unique=False,
            )

        op.execute(
            sa.text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_waiver_templates_single_active "
                "ON waiver_templates (status) WHERE status = 'active'"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_templates" not in existing_tables:
        return

    indexes = _index_names(inspector, "waiver_templates")
    op.execute(sa.text("DROP INDEX IF EXISTS uq_waiver_templates_single_active"))
    if "ix_waiver_templates_supersedes_template_id" in indexes:
        op.drop_index("ix_waiver_templates_supersedes_template_id", table_name="waiver_templates")
    if "ix_waiver_templates_status" in indexes:
        op.drop_index("ix_waiver_templates_status", table_name="waiver_templates")
    if "ix_waiver_templates_version" in indexes:
        op.drop_index("ix_waiver_templates_version", table_name="waiver_templates")

    op.drop_table("waiver_templates")
