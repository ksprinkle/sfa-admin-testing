"""add waiver lifecycle columns and audit events

Revision ID: t1c9e3a7b2d4
Revises: r8a1f6d3c5b2
Create Date: 2026-06-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "t1c9e3a7b2d4"
down_revision: Union[str, Sequence[str], None] = "r8a1f6d3c5b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector, table_name: str) -> set[str]:
    return {col["name"] for col in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "participant_waivers" in existing_tables:
        existing_columns = _column_names(inspector, "participant_waivers")

        with op.batch_alter_table("participant_waivers") as batch_op:
            if "current_revision" not in existing_columns:
                batch_op.add_column(sa.Column("current_revision", sa.Integer(), nullable=False, server_default="1"))
            if "version_metadata" not in existing_columns:
                batch_op.add_column(sa.Column("version_metadata", sa.JSON(), nullable=True))
            if "sent_at" not in existing_columns:
                batch_op.add_column(sa.Column("sent_at", sa.DateTime(), nullable=True))
            if "viewed_at" not in existing_columns:
                batch_op.add_column(sa.Column("viewed_at", sa.DateTime(), nullable=True))
            if "signed_at" not in existing_columns:
                batch_op.add_column(sa.Column("signed_at", sa.DateTime(), nullable=True))
            if "archived_at" not in existing_columns:
                batch_op.add_column(sa.Column("archived_at", sa.DateTime(), nullable=True))
            if "superseded_at" not in existing_columns:
                batch_op.add_column(sa.Column("superseded_at", sa.DateTime(), nullable=True))
            if "lifecycle_updated_at" not in existing_columns:
                batch_op.add_column(
                    sa.Column(
                        "lifecycle_updated_at",
                        sa.DateTime(),
                        nullable=False,
                        server_default=sa.text("CURRENT_TIMESTAMP"),
                    )
                )

        op.execute("UPDATE participant_waivers SET status = 'draft' WHERE status = 'pending'")
        op.execute("UPDATE participant_waivers SET status = 'signed' WHERE status = 'verified'")
        op.execute(
            "UPDATE participant_waivers "
            "SET signed_at = COALESCE(signed_at, verified_at), "
            "lifecycle_updated_at = COALESCE(lifecycle_updated_at, updated_at, created_at)"
        )

    if "waiver_audit_events" not in existing_tables:
        op.create_table(
            "waiver_audit_events",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("waiver_id", sa.UUID(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False, server_default="status_transition"),
            sa.Column("from_status", sa.String(), nullable=True),
            sa.Column("to_status", sa.String(), nullable=False),
            sa.Column("actor_user_id", sa.String(), nullable=True),
            sa.Column("source", sa.String(), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["waiver_id"], ["participant_waivers.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "waiver_audit_events" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "waiver_audit_events")
        if "ix_waiver_audit_events_waiver_id" not in indexes:
            op.create_index(
                "ix_waiver_audit_events_waiver_id",
                "waiver_audit_events",
                ["waiver_id"],
                unique=False,
            )
        if "ix_waiver_audit_events_created_at" not in indexes:
            op.create_index(
                "ix_waiver_audit_events_created_at",
                "waiver_audit_events",
                ["created_at"],
                unique=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "waiver_audit_events" in existing_tables:
        indexes = _index_names(inspector, "waiver_audit_events")
        if "ix_waiver_audit_events_created_at" in indexes:
            op.drop_index("ix_waiver_audit_events_created_at", table_name="waiver_audit_events")
        if "ix_waiver_audit_events_waiver_id" in indexes:
            op.drop_index("ix_waiver_audit_events_waiver_id", table_name="waiver_audit_events")
        op.drop_table("waiver_audit_events")

    if "participant_waivers" not in existing_tables:
        return

    existing_columns = _column_names(inspector, "participant_waivers")

    with op.batch_alter_table("participant_waivers") as batch_op:
        if "lifecycle_updated_at" in existing_columns:
            batch_op.drop_column("lifecycle_updated_at")
        if "superseded_at" in existing_columns:
            batch_op.drop_column("superseded_at")
        if "archived_at" in existing_columns:
            batch_op.drop_column("archived_at")
        if "signed_at" in existing_columns:
            batch_op.drop_column("signed_at")
        if "viewed_at" in existing_columns:
            batch_op.drop_column("viewed_at")
        if "sent_at" in existing_columns:
            batch_op.drop_column("sent_at")
        if "version_metadata" in existing_columns:
            batch_op.drop_column("version_metadata")
        if "current_revision" in existing_columns:
            batch_op.drop_column("current_revision")

    op.execute("UPDATE participant_waivers SET status = 'pending' WHERE status = 'draft'")
    op.execute("UPDATE participant_waivers SET status = 'verified' WHERE status = 'signed'")
