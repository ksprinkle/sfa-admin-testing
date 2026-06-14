"""add waiver deliveries

Revision ID: w6f3b2d8a9c1
Revises: v5d2a1c8f4e7
Create Date: 2026-06-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "w6f3b2d8a9c1"
down_revision: Union[str, Sequence[str], None] = "v5d2a1c8f4e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_deliveries" not in existing_tables:
        op.create_table(
            "waiver_deliveries",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("waiver_id", sa.UUID(), nullable=False),
            sa.Column("participant_id", sa.UUID(), nullable=False),
            sa.Column("resend_of_delivery_id", sa.UUID(), nullable=True),
            sa.Column("method", sa.String(), nullable=False),
            sa.Column("recipient", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="created"),
            sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("template_key", sa.String(), nullable=False, server_default="default"),
            sa.Column("rendered_subject", sa.String(), nullable=True),
            sa.Column("rendered_body", sa.String(), nullable=False),
            sa.Column("signing_path", sa.String(), nullable=False),
            sa.Column("token_expires_at", sa.DateTime(), nullable=False),
            sa.Column("provider_message_id", sa.String(), nullable=True),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("delivery_metadata", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["resend_of_delivery_id"], ["waiver_deliveries.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["waiver_id"], ["participant_waivers.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "waiver_deliveries" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "waiver_deliveries")
        if "ix_waiver_deliveries_waiver_id" not in indexes:
            op.create_index("ix_waiver_deliveries_waiver_id", "waiver_deliveries", ["waiver_id"], unique=False)
        if "ix_waiver_deliveries_participant_id" not in indexes:
            op.create_index("ix_waiver_deliveries_participant_id", "waiver_deliveries", ["participant_id"], unique=False)
        if "ix_waiver_deliveries_resend_of_delivery_id" not in indexes:
            op.create_index("ix_waiver_deliveries_resend_of_delivery_id", "waiver_deliveries", ["resend_of_delivery_id"], unique=False)
        if "ix_waiver_deliveries_created_at" not in indexes:
            op.create_index("ix_waiver_deliveries_created_at", "waiver_deliveries", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_deliveries" not in existing_tables:
        return

    indexes = _index_names(inspector, "waiver_deliveries")
    if "ix_waiver_deliveries_created_at" in indexes:
        op.drop_index("ix_waiver_deliveries_created_at", table_name="waiver_deliveries")
    if "ix_waiver_deliveries_resend_of_delivery_id" in indexes:
        op.drop_index("ix_waiver_deliveries_resend_of_delivery_id", table_name="waiver_deliveries")
    if "ix_waiver_deliveries_participant_id" in indexes:
        op.drop_index("ix_waiver_deliveries_participant_id", table_name="waiver_deliveries")
    if "ix_waiver_deliveries_waiver_id" in indexes:
        op.drop_index("ix_waiver_deliveries_waiver_id", table_name="waiver_deliveries")

    op.drop_table("waiver_deliveries")
