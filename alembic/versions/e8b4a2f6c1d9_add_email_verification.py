"""add email verification (users.email_verified_at, user_action_tokens)

Revision ID: e8b4a2f6c1d9
Revises: a5f2c8e1b9d3
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8b4a2f6c1d9"
down_revision: Union[str, Sequence[str], None] = "a5f2c8e1b9d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "email_verified_at" not in existing_user_columns:
        op.add_column("users", sa.Column("email_verified_at", sa.DateTime(), nullable=True))

    existing_tables = set(inspector.get_table_names())
    if "user_action_tokens" not in existing_tables:
        op.create_table(
            "user_action_tokens",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("purpose", sa.String(), nullable=False),
            sa.Column("token_hash", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="active"),
            sa.Column("issued_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("invalidated_at", sa.DateTime(), nullable=True),
            sa.Column("token_metadata", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("token_hash", name="uq_user_action_tokens_token_hash"),
        )

    inspector = sa.inspect(bind)
    if "user_action_tokens" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "user_action_tokens")
        if "ix_user_action_tokens_user_id" not in indexes:
            op.create_index(
                "ix_user_action_tokens_user_id",
                "user_action_tokens",
                ["user_id"],
                unique=False,
            )
        if "ix_user_action_tokens_token_hash" not in indexes:
            op.create_index(
                "ix_user_action_tokens_token_hash",
                "user_action_tokens",
                ["token_hash"],
                unique=True,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "user_action_tokens" in existing_tables:
        indexes = _index_names(inspector, "user_action_tokens")
        if "ix_user_action_tokens_token_hash" in indexes:
            op.drop_index("ix_user_action_tokens_token_hash", table_name="user_action_tokens")
        if "ix_user_action_tokens_user_id" in indexes:
            op.drop_index("ix_user_action_tokens_user_id", table_name="user_action_tokens")
        op.drop_table("user_action_tokens")

    existing_user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "email_verified_at" in existing_user_columns:
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("email_verified_at")
