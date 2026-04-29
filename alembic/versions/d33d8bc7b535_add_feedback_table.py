"""add_feedback_table

Revision ID: d33d8bc7b535
Revises: 808eb7aca1b1
Create Date: 2026-04-29 09:13:45.897086

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = 'd33d8bc7b535'
down_revision: Union[str, Sequence[str], None] = '808eb7aca1b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("id", sqlite.VARCHAR(36), primary_key=True),
        sa.Column("feature", sa.String(), nullable=False),
        sa.Column("version", sa.String(), nullable=False),
        sa.Column("responses", sa.Text(), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(datetime('now'))"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("feedback")
