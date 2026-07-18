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
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "feedback" not in set(inspector.get_table_names()):
        return

    existing_columns = {col["name"] for col in inspector.get_columns("feedback")}
    existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("feedback")}

    with op.batch_alter_table("feedback") as batch_op:
        if "submitted_by_user_id" not in existing_columns:
            batch_op.add_column(sa.Column("submitted_by_user_id", sa.String(), nullable=True))
        if "submitted_by_name" not in existing_columns:
            batch_op.add_column(sa.Column("submitted_by_name", sa.String(), nullable=True))
        if "submitted_by_email" not in existing_columns:
            batch_op.add_column(sa.Column("submitted_by_email", sa.String(), nullable=True))
        if "fk_feedback_submitted_by_user_id_users" not in existing_fks:
            batch_op.create_foreign_key(
                "fk_feedback_submitted_by_user_id_users",
                "users",
                ["submitted_by_user_id"],
                ["id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "feedback" not in set(inspector.get_table_names()):
        return

    existing_columns = {col["name"] for col in inspector.get_columns("feedback")}
    existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("feedback")}

    with op.batch_alter_table("feedback") as batch_op:
        if "fk_feedback_submitted_by_user_id_users" in existing_fks:
            batch_op.drop_constraint("fk_feedback_submitted_by_user_id_users", type_="foreignkey")
        if "submitted_by_email" in existing_columns:
            batch_op.drop_column("submitted_by_email")
        if "submitted_by_name" in existing_columns:
            batch_op.drop_column("submitted_by_name")
        if "submitted_by_user_id" in existing_columns:
            batch_op.drop_column("submitted_by_user_id")
