"""Merge heads

Revision ID: f6a992e5ddca
Revises: e4o7a2c9d1b5, u4e2b8f1d3c9
Create Date: 2026-07-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a992e5ddca'
down_revision: Union[str, Sequence[str], None] = ('e4o7a2c9d1b5', 'u4e2b8f1d3c9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
