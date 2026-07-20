"""add person_roles table and backfill from User.role (identity foundation slice B3)

Revision ID: b4e6a1d9c3f7
Revises: a7d3f9c2e5b8
Create Date: 2026-07-20

Phase 3B Slice B3: introduces the PersonRole dual-read infrastructure.
api/services/authorization.py::has_permission() now checks this person's
active PersonRole rows first, falling back to the legacy User.role only
when none exist - User.role remains authoritative and continues to be
written exactly as before (see PHASE3B_IDENTITY_FOUNDATION_
IMPLEMENTATION_ROADMAP.md). Backfill is idempotent - safe to replay
against a database where this migration has already partially run, and
deliberately skips any user whose `role` value has no matching row in
`roles` - that user simply keeps resolving permissions via the legacy
fallback path, exactly the designed safety net for this case.
"""

from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "b4e6a1d9c3f7"
down_revision: Union[str, Sequence[str], None] = "a7d3f9c2e5b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "person_roles" not in existing_tables:
        op.create_table(
            "person_roles",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("person_id", sa.UUID(), nullable=False),
            sa.Column("role_code", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="active"),
            sa.Column(
                "granted_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")
            ),
            sa.Column("granted_by_user_id", sa.String(), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")
            ),
            sa.Column(
                "updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")
            ),
            sa.ForeignKeyConstraint(["person_id"], ["people.id"]),
            sa.ForeignKeyConstraint(["role_code"], ["roles.code"]),
            sa.ForeignKeyConstraint(["granted_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("person_id", "role_code", name="uq_person_roles_person_id_role_code"),
        )

    # Re-inspect: the table above may have just been created, created by an
    # earlier partial run of this migration, or by create_all()'s
    # local-dev safety net - indexes/backfill below must apply in every case.
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "person_roles" in existing_tables:
        indexes = _index_names(inspector, "person_roles")
        if "ix_person_roles_person_id" not in indexes:
            op.create_index("ix_person_roles_person_id", "person_roles", ["person_id"], unique=False)
        if "ix_person_roles_role_code" not in indexes:
            op.create_index("ix_person_roles_role_code", "person_roles", ["role_code"], unique=False)

    person_roles_table = sa.table(
        "person_roles",
        sa.column("id", sa.UUID()),
        sa.column("person_id", sa.UUID()),
        sa.column("role_code", sa.String()),
        sa.column("status", sa.String()),
    )
    people_table = sa.table(
        "people",
        sa.column("id", sa.UUID()),
        sa.column("user_id", sa.String()),
    )
    users_table = sa.table(
        "users",
        sa.column("id", sa.String()),
        sa.column("role", sa.String()),
    )
    roles_table = sa.table(
        "roles",
        sa.column("code", sa.String()),
    )

    existing_role_codes = {row[0] for row in bind.execute(sa.select(roles_table.c.code))}
    already_granted = {
        (row[0], row[1])
        for row in bind.execute(sa.select(person_roles_table.c.person_id, person_roles_table.c.role_code))
    }

    join_query = sa.select(people_table.c.id, users_table.c.role).select_from(
        people_table.join(users_table, people_table.c.user_id == users_table.c.id)
    )

    for person_id, role in bind.execute(join_query):
        if role not in existing_role_codes:
            continue
        if (person_id, role) in already_granted:
            continue
        bind.execute(
            person_roles_table.insert().values(
                id=uuid.uuid4(),
                person_id=person_id,
                role_code=role,
                status="active",
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "person_roles" in existing_tables:
        indexes = _index_names(inspector, "person_roles")
        if "ix_person_roles_role_code" in indexes:
            op.drop_index("ix_person_roles_role_code", table_name="person_roles")
        if "ix_person_roles_person_id" in indexes:
            op.drop_index("ix_person_roles_person_id", table_name="person_roles")
        op.drop_table("person_roles")
