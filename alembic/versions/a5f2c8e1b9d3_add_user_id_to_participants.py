"""add user_id to participants

Revision ID: a5f2c8e1b9d3
Revises: n2r5t8v1x4y7
Create Date: 2026-07-18

Links a per-event Participant roster row to the authenticated
participant-role User account that self-registered it, if any (nullable —
admin-created rows and anonymous public registrations leave this null).
Foundational schema change for the Participant Portal identity model; see
ARCHITECTURE_OVERVIEW.md's Auth & Authorization section.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a5f2c8e1b9d3"
down_revision: Union[str, Sequence[str], None] = "n2r5t8v1x4y7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("participants")}

    if "user_id" not in columns:
        with op.batch_alter_table("participants") as batch_op:
            batch_op.add_column(sa.Column("user_id", sa.String(), nullable=True))
            batch_op.create_foreign_key(
                "fk_participants_user_id_users",
                "users",
                ["user_id"],
                ["id"],
            )

    inspector = sa.inspect(bind)
    indexes = {idx["name"] for idx in inspector.get_indexes("participants")}
    if "ix_participants_user_id" not in indexes:
        op.create_index("ix_participants_user_id", "participants", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {idx["name"] for idx in inspector.get_indexes("participants")}
    if "ix_participants_user_id" in indexes:
        op.drop_index("ix_participants_user_id", table_name="participants")

    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("participants")}
    if "user_id" in columns:
        with op.batch_alter_table("participants") as batch_op:
            batch_op.drop_constraint("fk_participants_user_id_users", type_="foreignkey")
            batch_op.drop_column("user_id")
