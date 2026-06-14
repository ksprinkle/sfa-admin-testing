"""add template provenance to waiver pdf artifacts

Revision ID: y7c1e5d9a2b4
Revises: x2d4b8c9f1a3
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "y7c1e5d9a2b4"
down_revision: Union[str, Sequence[str], None] = "x2d4b8c9f1a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_pdf_artifacts" not in existing_tables:
        return

    columns = _column_names(inspector, "waiver_pdf_artifacts")

    with op.batch_alter_table("waiver_pdf_artifacts") as batch_op:
        if "waiver_template_id" not in columns:
            batch_op.add_column(sa.Column("waiver_template_id", sa.UUID(), nullable=True))
            batch_op.create_foreign_key(
                "fk_waiver_pdf_artifacts_waiver_template_id",
                "waiver_templates",
                ["waiver_template_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if "template_version" not in columns:
            batch_op.add_column(sa.Column("template_version", sa.Integer(), nullable=True))
        if "template_content_sha256" not in columns:
            batch_op.add_column(sa.Column("template_content_sha256", sa.String(), nullable=True))

    inspector = sa.inspect(bind)
    indexes = _index_names(inspector, "waiver_pdf_artifacts")
    if "ix_waiver_pdf_artifacts_waiver_template_id" not in indexes:
        op.create_index(
            "ix_waiver_pdf_artifacts_waiver_template_id",
            "waiver_pdf_artifacts",
            ["waiver_template_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_pdf_artifacts" not in existing_tables:
        return

    indexes = _index_names(inspector, "waiver_pdf_artifacts")
    if "ix_waiver_pdf_artifacts_waiver_template_id" in indexes:
        op.drop_index("ix_waiver_pdf_artifacts_waiver_template_id", table_name="waiver_pdf_artifacts")

    columns = _column_names(inspector, "waiver_pdf_artifacts")
    with op.batch_alter_table("waiver_pdf_artifacts") as batch_op:
        if "template_content_sha256" in columns:
            batch_op.drop_column("template_content_sha256")
        if "template_version" in columns:
            batch_op.drop_column("template_version")
        if "waiver_template_id" in columns:
            batch_op.drop_constraint("fk_waiver_pdf_artifacts_waiver_template_id", type_="foreignkey")
            batch_op.drop_column("waiver_template_id")
