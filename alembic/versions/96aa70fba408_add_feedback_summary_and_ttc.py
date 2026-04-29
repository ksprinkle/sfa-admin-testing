"""add_feedback_summary_and_ttc

Revision ID: 96aa70fba408
Revises: d33d8bc7b535
Create Date: 2026-04-29 09:19:47.529226

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '96aa70fba408'
down_revision: Union[str, Sequence[str], None] = 'd33d8bc7b535'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("feedback") as batch_op:
        batch_op.add_column(sa.Column("summary", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("time_to_complete", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("feedback") as batch_op:
        batch_op.drop_column("time_to_complete")
        batch_op.drop_column("summary")
