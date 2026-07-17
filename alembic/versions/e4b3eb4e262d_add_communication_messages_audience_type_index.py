"""add missing communication_messages.audience_type index

Revision ID: e4b3eb4e262d
Revises: 7f6c9df3d7fd
Create Date: 2026-07-17

The Message model declares audience_type with index=True, but the
original create_table migration for communication_messages
(c4m6e8d1b3a9) omitted it from its index block. Guarded the same way
as every other create_index in this history so it is a no-op if the
index already exists (e.g. on a database where create_all() built the
table from the current model, which already includes index=True).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4b3eb4e262d"
down_revision: Union[str, Sequence[str], None] = "7f6c9df3d7fd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "communication_messages" not in set(inspector.get_table_names()):
        return
    indexes = {idx["name"] for idx in inspector.get_indexes("communication_messages")}
    if "ix_communication_messages_audience_type" not in indexes:
        op.create_index(
            "ix_communication_messages_audience_type",
            "communication_messages",
            ["audience_type"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "communication_messages" not in set(inspector.get_table_names()):
        return
    indexes = {idx["name"] for idx in inspector.get_indexes("communication_messages")}
    if "ix_communication_messages_audience_type" in indexes:
        op.drop_index("ix_communication_messages_audience_type", table_name="communication_messages")
