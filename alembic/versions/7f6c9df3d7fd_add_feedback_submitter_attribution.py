"""add_feedback_submitter_attribution

Revision ID: 7f6c9df3d7fd
Revises: f6a992e5ddca
Create Date: 2026-07-12 00:00:00.000001

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f6c9df3d7fd'
down_revision: Union[str, Sequence[str], None] = 'f6a992e5ddca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("feedback") as batch_op:
        batch_op.add_column(sa.Column("submitted_by_user_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("submitted_by_name", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("submitted_by_email", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_feedback_submitted_by_user_id_users",
            "users",
            ["submitted_by_user_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("feedback") as batch_op:
        batch_op.drop_constraint("fk_feedback_submitted_by_user_id_users", type_="foreignkey")
        batch_op.drop_column("submitted_by_email")
        batch_op.drop_column("submitted_by_name")
        batch_op.drop_column("submitted_by_user_id")
