"""add person_id to participants and volunteer_profiles (identity foundation slice B2)

Revision ID: a7d3f9c2e5b8
Revises: f3a8d1c6b9e2
Create Date: 2026-07-20

Phase 3B Slice B2: purely additive, backfill-only. person_id is not read
by any ownership check, authorization decision, or API response yet -
user_id remains the authoritative link on both tables until a later,
behavior-changing slice (see PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_
ROADMAP.md). Backfill is idempotent - safe to replay against a database
where this migration has already partially run.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7d3f9c2e5b8"
down_revision: Union[str, Sequence[str], None] = "f3a8d1c6b9e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector, table_name: str) -> set[str]:
    return {col["name"] for col in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_participant_columns = _column_names(inspector, "participants")
    if "person_id" not in existing_participant_columns:
        with op.batch_alter_table("participants") as batch_op:
            batch_op.add_column(sa.Column("person_id", sa.UUID(), nullable=True))
            batch_op.create_foreign_key(
                "fk_participants_person_id_people",
                "people",
                ["person_id"],
                ["id"],
            )

    existing_volunteer_columns = _column_names(inspector, "volunteer_profiles")
    if "person_id" not in existing_volunteer_columns:
        with op.batch_alter_table("volunteer_profiles") as batch_op:
            batch_op.add_column(sa.Column("person_id", sa.UUID(), nullable=True))
            batch_op.create_foreign_key(
                "fk_volunteer_profiles_person_id_people",
                "people",
                ["person_id"],
                ["id"],
            )

    # Re-inspect: columns above may have just been created, created by an
    # earlier partial run of this migration, or by create_all()'s
    # local-dev safety net - indexes/backfill below must apply in every case.
    inspector = sa.inspect(bind)

    participant_indexes = _index_names(inspector, "participants")
    if "ix_participants_person_id" not in participant_indexes:
        op.create_index("ix_participants_person_id", "participants", ["person_id"], unique=False)

    volunteer_indexes = _index_names(inspector, "volunteer_profiles")
    if "ix_volunteer_profiles_person_id" not in volunteer_indexes:
        op.create_index(
            "ix_volunteer_profiles_person_id", "volunteer_profiles", ["person_id"], unique=False
        )

    # Backfill: Participant.person_id from the Person correlated via
    # people.user_id (populated in B1). Idempotent - only touches rows
    # that don't already have a person_id, and only where a matching
    # Person actually exists. volunteer_profiles.person_id has no existing
    # correlation to backfill from (per the roadmap) and stays null for
    # every row in this slice.
    op.execute(
        """
        UPDATE participants
        SET person_id = (
            SELECT people.id FROM people WHERE people.user_id = participants.user_id
        )
        WHERE participants.user_id IS NOT NULL
          AND participants.person_id IS NULL
          AND EXISTS (
              SELECT 1 FROM people WHERE people.user_id = participants.user_id
          )
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    volunteer_indexes = _index_names(inspector, "volunteer_profiles")
    if "ix_volunteer_profiles_person_id" in volunteer_indexes:
        op.drop_index("ix_volunteer_profiles_person_id", table_name="volunteer_profiles")

    participant_indexes = _index_names(inspector, "participants")
    if "ix_participants_person_id" in participant_indexes:
        op.drop_index("ix_participants_person_id", table_name="participants")

    existing_volunteer_columns = _column_names(inspector, "volunteer_profiles")
    if "person_id" in existing_volunteer_columns:
        with op.batch_alter_table("volunteer_profiles") as batch_op:
            batch_op.drop_constraint("fk_volunteer_profiles_person_id_people", type_="foreignkey")
            batch_op.drop_column("person_id")

    existing_participant_columns = _column_names(inspector, "participants")
    if "person_id" in existing_participant_columns:
        with op.batch_alter_table("participants") as batch_op:
            batch_op.drop_constraint("fk_participants_person_id_people", type_="foreignkey")
            batch_op.drop_column("person_id")
