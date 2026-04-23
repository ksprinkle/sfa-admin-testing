"""add event logistics fields

Revision ID: 8f4c1a2d9b7e
Revises: 5c2b7f8a1d01
Create Date: 2026-04-23 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8f4c1a2d9b7e"
down_revision = "5c2b7f8a1d01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("events") as batch_op:
        batch_op.add_column(sa.Column("beach_access_notes", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("directions", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("parking_info", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("lodging_info", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("weather_report_url", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("surf_report_url", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("internal_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("events") as batch_op:
        batch_op.drop_column("internal_notes")
        batch_op.drop_column("surf_report_url")
        batch_op.drop_column("weather_report_url")
        batch_op.drop_column("lodging_info")
        batch_op.drop_column("parking_info")
        batch_op.drop_column("directions")
        batch_op.drop_column("beach_access_notes")