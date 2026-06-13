"""add waiver signing tokens

Revision ID: u4a7d2c9e1f5
Revises: t1c9e3a7b2d4
Create Date: 2026-06-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "u4a7d2c9e1f5"
down_revision: Union[str, Sequence[str], None] = "t1c9e3a7b2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_signing_tokens" not in existing_tables:
        op.create_table(
            "waiver_signing_tokens",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("waiver_id", sa.UUID(), nullable=False),
            sa.Column("token_hash", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="active"),
            sa.Column("issued_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("first_viewed_at", sa.DateTime(), nullable=True),
            sa.Column("last_validated_at", sa.DateTime(), nullable=True),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("signed_at", sa.DateTime(), nullable=True),
            sa.Column("invalidated_at", sa.DateTime(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("token_metadata", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["waiver_id"], ["participant_waivers.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_hash", name="uq_waiver_signing_tokens_token_hash"),
        )

    inspector = sa.inspect(bind)
    if "waiver_signing_tokens" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "waiver_signing_tokens")
        if "ix_waiver_signing_tokens_waiver_id" not in indexes:
            op.create_index(
                "ix_waiver_signing_tokens_waiver_id",
                "waiver_signing_tokens",
                ["waiver_id"],
                unique=False,
            )
        if "ix_waiver_signing_tokens_token_hash" not in indexes:
            op.create_index(
                "ix_waiver_signing_tokens_token_hash",
                "waiver_signing_tokens",
                ["token_hash"],
                unique=True,
            )
        if "ix_waiver_signing_tokens_expires_at" not in indexes:
            op.create_index(
                "ix_waiver_signing_tokens_expires_at",
                "waiver_signing_tokens",
                ["expires_at"],
                unique=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_signing_tokens" not in existing_tables:
        return

    indexes = _index_names(inspector, "waiver_signing_tokens")
    if "ix_waiver_signing_tokens_expires_at" in indexes:
        op.drop_index("ix_waiver_signing_tokens_expires_at", table_name="waiver_signing_tokens")
    if "ix_waiver_signing_tokens_token_hash" in indexes:
        op.drop_index("ix_waiver_signing_tokens_token_hash", table_name="waiver_signing_tokens")
    if "ix_waiver_signing_tokens_waiver_id" in indexes:
        op.drop_index("ix_waiver_signing_tokens_waiver_id", table_name="waiver_signing_tokens")

    op.drop_table("waiver_signing_tokens")
