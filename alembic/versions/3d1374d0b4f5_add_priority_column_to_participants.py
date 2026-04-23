"""add priority column to participants

Revision ID: 3d1374d0b4f5
Revises: da4aa9c666dc
Create Date: 2026-04-18 00:22:41.397487

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '3d1374d0b4f5'
down_revision: Union[str, Sequence[str], None] = 'da4aa9c666dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)
    participant_columns = {column["name"] for column in inspector.get_columns("participants")}

    if "priority" not in participant_columns:
        op.add_column('participants', sa.Column('priority', sa.Integer(), nullable=False, default=0))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('participants', 'priority')
