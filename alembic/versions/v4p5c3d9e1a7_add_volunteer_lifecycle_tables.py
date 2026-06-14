"""add volunteer lifecycle tables

Revision ID: v4p5c3d9e1a7
Revises: p4a4f1d8c2b7
Create Date: 2026-06-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v4p5c3d9e1a7"
down_revision: Union[str, Sequence[str], None] = "p4a4f1d8c2b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "volunteer_profiles" not in existing_tables:
        op.create_table(
            "volunteer_profiles",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("first_name", sa.String(), nullable=False),
            sa.Column("last_name", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("lifecycle_status", sa.String(), nullable=False, server_default="active"),
            sa.Column("skills", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("certifications", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("email", name="uq_volunteer_profiles_email"),
        )

    inspector = sa.inspect(bind)
    if "volunteer_profiles" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "volunteer_profiles")
        if "ix_volunteer_profiles_email" not in indexes:
            op.create_index("ix_volunteer_profiles_email", "volunteer_profiles", ["email"], unique=True)
        if "ix_volunteer_profiles_lifecycle_status" not in indexes:
            op.create_index("ix_volunteer_profiles_lifecycle_status", "volunteer_profiles", ["lifecycle_status"], unique=False)

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "volunteer_availabilities" not in existing_tables:
        op.create_table(
            "volunteer_availabilities",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("volunteer_id", sa.UUID(), nullable=False),
            sa.Column("weekday", sa.Integer(), nullable=True),
            sa.Column("availability_date", sa.Date(), nullable=True),
            sa.Column("start_time", sa.Time(), nullable=True),
            sa.Column("end_time", sa.Time(), nullable=True),
            sa.Column("availability_status", sa.String(), nullable=False, server_default="available"),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["volunteer_id"], ["volunteer_profiles.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "volunteer_availabilities" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "volunteer_availabilities")
        if "ix_volunteer_availabilities_volunteer_id" not in indexes:
            op.create_index("ix_volunteer_availabilities_volunteer_id", "volunteer_availabilities", ["volunteer_id"], unique=False)
        if "ix_volunteer_availabilities_created_at" not in indexes:
            op.create_index("ix_volunteer_availabilities_created_at", "volunteer_availabilities", ["created_at"], unique=False)

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "volunteer_assignments" not in existing_tables:
        op.create_table(
            "volunteer_assignments",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("volunteer_id", sa.UUID(), nullable=False),
            sa.Column("event_id", sa.UUID(), nullable=False),
            sa.Column("session_id", sa.UUID(), nullable=True),
            sa.Column("assignment_role", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="assigned"),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("assigned_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
            sa.ForeignKeyConstraint(["volunteer_id"], ["volunteer_profiles.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    if "volunteer_assignments" in set(inspector.get_table_names()):
        indexes = _index_names(inspector, "volunteer_assignments")
        if "ix_volunteer_assignments_volunteer_id" not in indexes:
            op.create_index("ix_volunteer_assignments_volunteer_id", "volunteer_assignments", ["volunteer_id"], unique=False)
        if "ix_volunteer_assignments_event_id" not in indexes:
            op.create_index("ix_volunteer_assignments_event_id", "volunteer_assignments", ["event_id"], unique=False)
        if "ix_volunteer_assignments_session_id" not in indexes:
            op.create_index("ix_volunteer_assignments_session_id", "volunteer_assignments", ["session_id"], unique=False)
        if "ix_volunteer_assignments_status" not in indexes:
            op.create_index("ix_volunteer_assignments_status", "volunteer_assignments", ["status"], unique=False)
        if "ix_volunteer_assignments_created_at" not in indexes:
            op.create_index("ix_volunteer_assignments_created_at", "volunteer_assignments", ["created_at"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "volunteer_assignments" in existing_tables:
        indexes = _index_names(inspector, "volunteer_assignments")
        if "ix_volunteer_assignments_created_at" in indexes:
            op.drop_index("ix_volunteer_assignments_created_at", table_name="volunteer_assignments")
        if "ix_volunteer_assignments_status" in indexes:
            op.drop_index("ix_volunteer_assignments_status", table_name="volunteer_assignments")
        if "ix_volunteer_assignments_session_id" in indexes:
            op.drop_index("ix_volunteer_assignments_session_id", table_name="volunteer_assignments")
        if "ix_volunteer_assignments_event_id" in indexes:
            op.drop_index("ix_volunteer_assignments_event_id", table_name="volunteer_assignments")
        if "ix_volunteer_assignments_volunteer_id" in indexes:
            op.drop_index("ix_volunteer_assignments_volunteer_id", table_name="volunteer_assignments")
        op.drop_table("volunteer_assignments")

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "volunteer_availabilities" in existing_tables:
        indexes = _index_names(inspector, "volunteer_availabilities")
        if "ix_volunteer_availabilities_created_at" in indexes:
            op.drop_index("ix_volunteer_availabilities_created_at", table_name="volunteer_availabilities")
        if "ix_volunteer_availabilities_volunteer_id" in indexes:
            op.drop_index("ix_volunteer_availabilities_volunteer_id", table_name="volunteer_availabilities")
        op.drop_table("volunteer_availabilities")

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "volunteer_profiles" in existing_tables:
        indexes = _index_names(inspector, "volunteer_profiles")
        if "ix_volunteer_profiles_lifecycle_status" in indexes:
            op.drop_index("ix_volunteer_profiles_lifecycle_status", table_name="volunteer_profiles")
        if "ix_volunteer_profiles_email" in indexes:
            op.drop_index("ix_volunteer_profiles_email", table_name="volunteer_profiles")
        op.drop_table("volunteer_profiles")