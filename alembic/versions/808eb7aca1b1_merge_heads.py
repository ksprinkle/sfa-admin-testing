"""merge heads

Revision ID: 808eb7aca1b1
Revises: a7b1e8b14ffd, m1a2b3c4d5e6
Create Date: 2026-04-28 12:05:31.481455

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '808eb7aca1b1'
down_revision: Union[str, Sequence[str], None] = ('a7b1e8b14ffd', 'm1a2b3c4d5e6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
