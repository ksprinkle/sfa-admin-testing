"""add template schedule rule fields

Revision ID: c4d21f09a6be
Revises: e6c1f4b2a9d8
Create Date: 2026-04-26 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d21f09a6be'
down_revision: Union[str, Sequence[str], None] = 'e6c1f4b2a9d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    template_columns = {col["name"] for col in inspector.get_columns("event_templates")}
    if "schedule_rule_type" not in template_columns:
        op.add_column(
            "event_templates",
            sa.Column("schedule_rule_type", sa.String(), nullable=False, server_default="nth_weekday"),
        )
    if "schedule_months" not in template_columns:
        op.add_column(
            "event_templates",
            sa.Column("schedule_months", sa.JSON(), nullable=False, server_default=sa.text("'[5,6,7,8,9]'")),
        )
    if "schedule_weekday" not in template_columns:
        op.add_column(
            "event_templates",
            sa.Column("schedule_weekday", sa.Integer(), nullable=False, server_default="5"),
        )
    if "schedule_week_numbers" not in template_columns:
        op.add_column(
            "event_templates",
            sa.Column("schedule_week_numbers", sa.JSON(), nullable=False, server_default=sa.text("'[2,3]'")),
        )

    event_columns = {col["name"] for col in inspector.get_columns("events")}
    if "template_id" not in event_columns:
        op.add_column("events", sa.Column("template_id", sa.Uuid(), nullable=True))

    index_names = {idx["name"] for idx in inspector.get_indexes("events")}
    if "ix_events_template_id" not in index_names:
        op.create_index(op.f("ix_events_template_id"), "events", ["template_id"], unique=False)

def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    index_names = {idx["name"] for idx in inspector.get_indexes("events")}
    if "ix_events_template_id" in index_names:
        op.drop_index(op.f("ix_events_template_id"), table_name="events")

    event_columns = {col["name"] for col in inspector.get_columns("events")}
    if "template_id" in event_columns:
        with op.batch_alter_table("events", schema=None) as batch_op:
            batch_op.drop_column("template_id")

    template_columns = {col["name"] for col in inspector.get_columns("event_templates")}
    for column_name in ("schedule_week_numbers", "schedule_weekday", "schedule_months", "schedule_rule_type"):
        if column_name in template_columns:
            with op.batch_alter_table("event_templates", schema=None) as batch_op:
                batch_op.drop_column(column_name)
