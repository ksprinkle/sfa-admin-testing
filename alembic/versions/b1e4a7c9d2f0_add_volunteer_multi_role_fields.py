"""add volunteer multi-role fields

Revision ID: b1e4a7c9d2f0
Revises: f2a9c3d7e1b5
Create Date: 2026-04-24

Adds support for:
  - surf_buddy volunteer type
  - additional volunteer roles
  - versatile volunteers
"""

from alembic import op
import sqlalchemy as sa

revision: str = "b1e4a7c9d2f0"
down_revision = "f2a9c3d7e1b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("volunteer_additional_types", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "participants",
        sa.Column("volunteer_is_versatile", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )

    op.execute(
        "UPDATE participants SET volunteer_additional_types = '[]' WHERE volunteer_additional_types IS NULL"
    )


def downgrade() -> None:
    op.drop_column("participants", "volunteer_is_versatile")
    op.drop_column("participants", "volunteer_additional_types")
