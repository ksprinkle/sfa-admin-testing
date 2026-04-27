"""Merge heads

Revision ID: a7b1e8b14ffd
Revises: c4d21f09a6be, f5e3d9c1a6b2
Create Date: 2026-04-27 14:19:52.076501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b1e8b14ffd'
down_revision: Union[str, Sequence[str], None] = ('c4d21f09a6be', 'f5e3d9c1a6b2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
