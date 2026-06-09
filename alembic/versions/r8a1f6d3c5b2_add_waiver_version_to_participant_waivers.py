"""add waiver_version to participant waivers

Revision ID: r8a1f6d3c5b2
Revises: q4f7c2b9a8d1
Create Date: 2026-06-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r8a1f6d3c5b2"
down_revision: Union[str, Sequence[str], None] = "q4f7c2b9a8d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "participant_waivers" not in existing_tables:
        return

    existing_columns = {col["name"] for col in inspector.get_columns("participant_waivers")}
    if "waiver_version" in existing_columns:
        return

    with op.batch_alter_table("participant_waivers") as batch_op:
        batch_op.add_column(sa.Column("waiver_version", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "participant_waivers" not in existing_tables:
        return

    existing_columns = {col["name"] for col in inspector.get_columns("participant_waivers")}
    if "waiver_version" not in existing_columns:
        return

    with op.batch_alter_table("participant_waivers") as batch_op:
        batch_op.drop_column("waiver_version")
