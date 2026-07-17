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


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade():
    # This revision originally did nothing (`pass`), relying on
    # api/main.py's Base.metadata.create_all() to build users/events/
    # sessions/participants/telemetry_records instead of Alembic. That
    # left `alembic upgrade head` unable to reproduce the schema on a
    # genuinely fresh database — every later migration that alters one
    # of these tables assumes it already exists. Every create_table/
    # create_index below is guarded so this remains a no-op against any
    # database create_all() already populated (including production and
    # every existing local/dev database), matching the guarded pattern
    # already used elsewhere in this history (see
    # p4a4f1d8c2b7_add_automation_foundation_tables.py).
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "users" not in existing_tables:
        op.create_table(
            "users",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("hashed_password", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "users" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "users")
        if "ix_users_email" not in indexes:
            op.create_index("ix_users_email", "users", ["email"], unique=True)

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "events" not in existing_tables:
        op.create_table(
            "events",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("slug", sa.String(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("start_time", sa.Time(), nullable=True),
            sa.Column("end_time", sa.Time(), nullable=True),
            sa.Column("timezone", sa.String(), nullable=True),
            sa.Column("venue", sa.String(), nullable=True),
            sa.Column("city", sa.String(), nullable=True),
            sa.Column("state", sa.String(), nullable=True),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.Column("beach_accessibility", sa.Boolean(), nullable=True),
            sa.Column("participant_capacity", sa.Integer(), nullable=True),
            sa.Column("volunteer_capacity", sa.Integer(), nullable=True),
            sa.Column("participant_open", sa.Boolean(), nullable=True),
            sa.Column("volunteer_open", sa.Boolean(), nullable=True),
            sa.Column("vendor_open", sa.Boolean(), nullable=True),
            sa.Column("featured_image", sa.String(), nullable=True),
            sa.Column("no_show_minutes", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slug", name="uq_events_slug"),
        )

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "sessions" not in existing_tables:
        op.create_table(
            "sessions",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("event_id", sa.UUID(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("start_time", sa.DateTime(), nullable=True),
            sa.Column("end_time", sa.DateTime(), nullable=True),
            sa.Column("capacity", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "participants" not in existing_tables:
        op.create_table(
            "participants",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("event_id", sa.UUID(), nullable=False),
            sa.Column("session_id", sa.UUID(), nullable=True),
            sa.Column("first_name", sa.String(), nullable=False),
            sa.Column("last_name", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("is_minor", sa.Boolean(), nullable=True),
            sa.Column("is_waitlisted", sa.Boolean(), nullable=True),
            sa.Column("waiver_signed", sa.Boolean(), nullable=True),
            sa.Column("waiver_verified", sa.Boolean(), nullable=True),
            sa.Column("waiver_signed_at", sa.DateTime(), nullable=True),
            sa.Column("checked_in", sa.Boolean(), nullable=True),
            sa.Column("checked_in_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
            sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("event_id", "email", name="uq_event_participant_email"),
        )

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "telemetry_records" not in existing_tables:
        op.create_table(
            "telemetry_records",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("occurred_at", sa.DateTime(), nullable=False),
            sa.Column("schema_version", sa.String(), nullable=False),
            sa.Column("correlation_id", sa.String(), nullable=True),
            sa.Column("execution_id", sa.String(), nullable=True),
            sa.Column("reminder_id", sa.String(), nullable=True),
            sa.Column("provider_name", sa.String(), nullable=True),
            sa.Column("channel", sa.String(), nullable=True),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column("tags", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "telemetry_records" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "telemetry_records")
        for col in ("event_type", "category", "occurred_at", "correlation_id",
                    "execution_id", "reminder_id", "provider_name", "channel", "created_at"):
            ix_name = f"ix_telemetry_records_{col}"
            if ix_name not in indexes:
                op.create_index(ix_name, "telemetry_records", [col], unique=False)


def downgrade():
        # Intentionally a no-op, unchanged from the original baseline revision.
        # This is the first migration in the chain; there is nothing before it
        # to downgrade to, and the guarded upgrade() above must never be
        # reversed automatically since production tables predate Alembic
        # tracking entirely and are not safe to drop programmatically.
        pass