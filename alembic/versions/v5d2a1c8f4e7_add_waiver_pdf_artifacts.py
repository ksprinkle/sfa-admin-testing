"""add waiver pdf artifacts

Revision ID: v5d2a1c8f4e7
Revises: u4a7d2c9e1f5
Create Date: 2026-06-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v5d2a1c8f4e7"
down_revision: Union[str, Sequence[str], None] = "u4a7d2c9e1f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_pdf_artifacts" not in existing_tables:
        op.create_table(
            "waiver_pdf_artifacts",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("waiver_id", sa.UUID(), nullable=False),
            sa.Column("participant_id", sa.UUID(), nullable=False),
            sa.Column("waiver_version", sa.String(), nullable=True),
            sa.Column("waiver_revision", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("storage_path", sa.String(), nullable=False),
            sa.Column("mime_type", sa.String(), nullable=False, server_default="application/pdf"),
            sa.Column("sha256_hash", sa.String(), nullable=False),
            sa.Column("byte_size", sa.Integer(), nullable=False),
            sa.Column("is_immutable", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("generated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("generated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["generated_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["waiver_id"], ["participant_waivers.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("storage_path", name="uq_waiver_pdf_artifacts_storage_path"),
            sa.UniqueConstraint("waiver_id", "waiver_revision", name="uq_waiver_pdf_artifacts_waiver_revision"),
        )

    inspector = sa.inspect(bind)
    if "waiver_pdf_artifacts" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "waiver_pdf_artifacts")
        if "ix_waiver_pdf_artifacts_waiver_id" not in indexes:
            op.create_index("ix_waiver_pdf_artifacts_waiver_id", "waiver_pdf_artifacts", ["waiver_id"], unique=False)
        if "ix_waiver_pdf_artifacts_participant_id" not in indexes:
            op.create_index("ix_waiver_pdf_artifacts_participant_id", "waiver_pdf_artifacts", ["participant_id"], unique=False)
        if "ix_waiver_pdf_artifacts_generated_at" not in indexes:
            op.create_index("ix_waiver_pdf_artifacts_generated_at", "waiver_pdf_artifacts", ["generated_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_pdf_artifacts" not in existing_tables:
        return

    indexes = _index_names(inspector, "waiver_pdf_artifacts")
    if "ix_waiver_pdf_artifacts_generated_at" in indexes:
        op.drop_index("ix_waiver_pdf_artifacts_generated_at", table_name="waiver_pdf_artifacts")
    if "ix_waiver_pdf_artifacts_participant_id" in indexes:
        op.drop_index("ix_waiver_pdf_artifacts_participant_id", table_name="waiver_pdf_artifacts")
    if "ix_waiver_pdf_artifacts_waiver_id" in indexes:
        op.drop_index("ix_waiver_pdf_artifacts_waiver_id", table_name="waiver_pdf_artifacts")

    op.drop_table("waiver_pdf_artifacts")
