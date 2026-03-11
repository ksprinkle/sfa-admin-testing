"""baseline schema

Revision ID: a183b0b7b8a3
Revises: 
Create Date: 2026-03-10 10:16:56.653505

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a183b0b7b8a3'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
        pass
    

def downgrade(): 
        pass