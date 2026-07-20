"""add households and person_relationships tables (identity foundation slice B4)

Revision ID: c8f2b6a4d1e9
Revises: b4e6a1d9c3f7
Create Date: 2026-07-20

Phase 3B Slice B4: purely additive, no backfill and no reference data
seeded. `person_relationships` and `households` are net new - unlike
`ParticipantWaiver`/`Participant.person_id`/`User.role`, there is no
existing free-text or inferred data to backfill from (confirmed in the
Phase 3 architecture review: no emergency-contact or guardian fields
exist anywhere in the current schema). No existing table's foreign
keys, columns, or data are touched. Nothing in the application reads
or writes either table yet - see PHASE3B_IDENTITY_FOUNDATION_
IMPLEMENTATION_ROADMAP.md.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8f2b6a4d1e9"
down_revision: Union[str, Sequence[str], None] = "b4e6a1d9c3f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "households" not in existing_tables:
        op.create_table(
            "households",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")
            ),
            sa.Column(
                "updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "person_relationships" not in existing_tables:
        op.create_table(
            "person_relationships",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("subject_person_id", sa.UUID(), nullable=False),
            sa.Column("related_person_id", sa.UUID(), nullable=False),
            sa.Column("relationship_type", sa.String(), nullable=False),
            sa.Column("can_register_for", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("can_view_documents", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("can_manage_documents", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column(
                "can_receive_communications", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
            sa.Column(
                "is_emergency_contact_only", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
            sa.Column("household_id", sa.UUID(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="active"),
            sa.Column("verified_at", sa.DateTime(), nullable=True),
            sa.Column("verified_by_user_id", sa.String(), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")
            ),
            sa.Column(
                "updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")
            ),
            sa.ForeignKeyConstraint(["subject_person_id"], ["people.id"]),
            sa.ForeignKeyConstraint(["related_person_id"], ["people.id"]),
            sa.ForeignKeyConstraint(["household_id"], ["households.id"]),
            sa.ForeignKeyConstraint(["verified_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    # Re-inspect: the tables above may have just been created, created by
    # an earlier partial run of this migration, or by create_all()'s
    # local-dev safety net - index creation below must apply in every case.
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "person_relationships" in existing_tables:
        indexes = _index_names(inspector, "person_relationships")
        if "ix_person_relationships_subject_person_id" not in indexes:
            op.create_index(
                "ix_person_relationships_subject_person_id",
                "person_relationships",
                ["subject_person_id"],
                unique=False,
            )
        if "ix_person_relationships_related_person_id" not in indexes:
            op.create_index(
                "ix_person_relationships_related_person_id",
                "person_relationships",
                ["related_person_id"],
                unique=False,
            )
        if "ix_person_relationships_household_id" not in indexes:
            op.create_index(
                "ix_person_relationships_household_id",
                "person_relationships",
                ["household_id"],
                unique=False,
            )

    # No backfill, no seed data: person_relationships/households are net
    # new with nothing existing to infer them from - deliberately not
    # attempted (see module docstring).


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "person_relationships" in existing_tables:
        indexes = _index_names(inspector, "person_relationships")
        if "ix_person_relationships_household_id" in indexes:
            op.drop_index("ix_person_relationships_household_id", table_name="person_relationships")
        if "ix_person_relationships_related_person_id" in indexes:
            op.drop_index("ix_person_relationships_related_person_id", table_name="person_relationships")
        if "ix_person_relationships_subject_person_id" in indexes:
            op.drop_index("ix_person_relationships_subject_person_id", table_name="person_relationships")
        op.drop_table("person_relationships")

    if "households" in existing_tables:
        op.drop_table("households")
