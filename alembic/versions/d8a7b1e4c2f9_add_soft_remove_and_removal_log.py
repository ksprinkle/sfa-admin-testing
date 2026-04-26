"""add soft-remove fields and participant removal log

Revision ID: d8a7b1e4c2f9
Revises: c9f4e2b6a1d3
Create Date: 2026-04-25
"""

from alembic import op
import sqlalchemy as sa


revision: str = "d8a7b1e4c2f9"
down_revision = "c9f4e2b6a1d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    participant_columns = {col["name"] for col in inspector.get_columns("participants")}

    if "removed_at" not in participant_columns:
        op.add_column("participants", sa.Column("removed_at", sa.DateTime(), nullable=True))
    if "removed_reason_code" not in participant_columns:
        op.add_column("participants", sa.Column("removed_reason_code", sa.String(), nullable=True))
    if "removed_reason_note" not in participant_columns:
        op.add_column("participants", sa.Column("removed_reason_note", sa.String(), nullable=True))
    if "removed_by_user_id" not in participant_columns:
        op.add_column("participants", sa.Column("removed_by_user_id", sa.String(), nullable=True))
    if "removed_stage" not in participant_columns:
        op.add_column("participants", sa.Column("removed_stage", sa.String(), nullable=True))

    existing_tables = set(inspector.get_table_names())
    if "participant_removal_logs" not in existing_tables:
        op.create_table(
            "participant_removal_logs",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("participant_id", sa.String(), nullable=False),
            sa.Column("event_id", sa.String(), nullable=False),
            sa.Column("first_name", sa.String(), nullable=False),
            sa.Column("last_name", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("was_waitlisted", sa.String(), nullable=False, server_default="false"),
            sa.Column("was_checked_in", sa.String(), nullable=False, server_default="false"),
            sa.Column("was_waiver_verified", sa.String(), nullable=False, server_default="false"),
            sa.Column("removed_reason_code", sa.String(), nullable=False),
            sa.Column("removed_reason_note", sa.String(), nullable=True),
            sa.Column("removed_stage", sa.String(), nullable=False),
            sa.Column("removed_by_user_id", sa.String(), nullable=True),
            sa.Column("removed_by_user_email", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("participant_removal_logs")}
    if "ix_participant_removal_logs_email" not in existing_indexes:
        op.create_index("ix_participant_removal_logs_email", "participant_removal_logs", ["email"], unique=False)
    if "ix_participant_removal_logs_event_id" not in existing_indexes:
        op.create_index("ix_participant_removal_logs_event_id", "participant_removal_logs", ["event_id"], unique=False)
    if "ix_participant_removal_logs_participant_id" not in existing_indexes:
        op.create_index("ix_participant_removal_logs_participant_id", "participant_removal_logs", ["participant_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_tables = set(inspector.get_table_names())
    if "participant_removal_logs" in existing_tables:
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("participant_removal_logs")}
        if "ix_participant_removal_logs_participant_id" in existing_indexes:
            op.drop_index("ix_participant_removal_logs_participant_id", table_name="participant_removal_logs")
        if "ix_participant_removal_logs_event_id" in existing_indexes:
            op.drop_index("ix_participant_removal_logs_event_id", table_name="participant_removal_logs")
        if "ix_participant_removal_logs_email" in existing_indexes:
            op.drop_index("ix_participant_removal_logs_email", table_name="participant_removal_logs")
        op.drop_table("participant_removal_logs")

    participant_columns = {col["name"] for col in inspector.get_columns("participants")}
    if "removed_stage" in participant_columns:
        op.drop_column("participants", "removed_stage")
    if "removed_by_user_id" in participant_columns:
        op.drop_column("participants", "removed_by_user_id")
    if "removed_reason_note" in participant_columns:
        op.drop_column("participants", "removed_reason_note")
    if "removed_reason_code" in participant_columns:
        op.drop_column("participants", "removed_reason_code")
    if "removed_at" in participant_columns:
        op.drop_column("participants", "removed_at")
