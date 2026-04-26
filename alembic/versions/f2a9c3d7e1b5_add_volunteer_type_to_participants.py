"""add volunteer_type to participants

Revision ID: f2a9c3d7e1b5
Revises: 8f4c1a2d9b7e
Create Date: 2026-04-24

Volunteer types:
  - food / raffle : open as soon as the event is published
  - beach / surf_instructor : gated to 14 days before the event
"""

from alembic import op
import sqlalchemy as sa

revision: str = "f2a9c3d7e1b5"
down_revision = "8f4c1a2d9b7e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("volunteer_type", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("participants", "volunteer_type")
