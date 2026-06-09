"""add participant waivers table

Revision ID: q4f7c2b9a8d1
Revises: 96aa70fba408
Create Date: 2026-06-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "q4f7c2b9a8d1"
down_revision: Union[str, Sequence[str], None] = "96aa70fba408"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "participant_waivers" not in existing_tables:
        op.create_table(
            "participant_waivers",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("participant_id", sa.UUID(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("source", sa.String(), nullable=False, server_default="staff_override"),
            sa.Column("verified_at", sa.DateTime(), nullable=True),
            sa.Column("verified_by_user_id", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["verified_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("participant_id", name="uq_participant_waivers_participant_id"),
        )

    indexes = {idx["name"] for idx in inspector.get_indexes("participant_waivers")}

    if "ix_participant_waivers_participant_id" not in indexes:
        op.create_index(
            "ix_participant_waivers_participant_id",
            "participant_waivers",
            ["participant_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "participant_waivers" not in existing_tables:
        return

    indexes = {idx["name"] for idx in inspector.get_indexes("participant_waivers")}
    if "ix_participant_waivers_participant_id" in indexes:
        op.drop_index("ix_participant_waivers_participant_id", table_name="participant_waivers")

    op.drop_table("participant_waivers")
