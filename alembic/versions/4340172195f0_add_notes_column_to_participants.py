"""add notes column to participants

Revision ID: 4340172195f0
Revises: a183b0b7b8a3
Create Date: 2026-03-10
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "4340172195f0"
down_revision: Union[str, Sequence[str], None] = "a183b0b7b8a3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "participants",
        sa.Column("notes", sa.String(), nullable=True)
    )


def downgrade():
    op.drop_column("participants", "notes")