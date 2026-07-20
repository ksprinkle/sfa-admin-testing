"""add person and role tables (identity foundation slice B1)

Revision ID: f3a8d1c6b9e2
Revises: e8b4a2f6c1d9
Create Date: 2026-07-20

Phase 3B Slice B1: purely additive. Neither table is referenced by any
existing table's foreign key, and no application code reads or writes
either table yet (see PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md).
Backfill is idempotent — safe to replay against a database where this
migration (or an equivalent create_all()) has already partially run.
"""

from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "f3a8d1c6b9e2"
down_revision: Union[str, Sequence[str], None] = "e8b4a2f6c1d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ROLE_SEED_DATA = [
    {"code": "participant", "display_name": "Participant"},
    {"code": "admin", "display_name": "Admin"},
]


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "people" not in existing_tables:
        op.create_table(
            "people",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_people_user_id"),
        )

    if "roles" not in existing_tables:
        op.create_table(
            "roles",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("display_name", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code", name="uq_roles_code"),
        )

    # Re-inspect: the tables above may have been created just now, by an
    # earlier partial run of this migration, or by create_all()'s local-dev
    # safety net — indexes/backfill below must apply in every case.
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "people" in existing_tables:
        indexes = _index_names(inspector, "people")
        if "ix_people_email" not in indexes:
            op.create_index("ix_people_email", "people", ["email"], unique=False)

    if "roles" in existing_tables:
        indexes = _index_names(inspector, "roles")
        if "ix_roles_code" not in indexes:
            op.create_index("ix_roles_code", "roles", ["code"], unique=True)

    people_table = sa.table(
        "people",
        sa.column("id", sa.UUID()),
        sa.column("user_id", sa.String()),
        sa.column("email", sa.String()),
    )
    roles_table = sa.table(
        "roles",
        sa.column("id", sa.UUID()),
        sa.column("code", sa.String()),
        sa.column("display_name", sa.String()),
    )
    users_table = sa.table(
        "users",
        sa.column("id", sa.String()),
        sa.column("email", sa.String()),
    )

    # Backfill: exactly one Person per existing User, correlated via
    # people.user_id. Idempotent — skips any user_id that already has a
    # Person row, so replaying this migration never creates duplicates.
    already_linked_user_ids = {
        row[0]
        for row in bind.execute(
            sa.select(people_table.c.user_id).where(people_table.c.user_id.isnot(None))
        )
    }

    for user_id, email in bind.execute(sa.select(users_table.c.id, users_table.c.email)):
        if user_id in already_linked_user_ids:
            continue
        bind.execute(
            people_table.insert().values(id=uuid.uuid4(), user_id=user_id, email=email)
        )

    # Backfill: the two roles ROLE_PERMISSIONS already defines
    # (api/services/authorization.py) — idempotent by code.
    existing_role_codes = {row[0] for row in bind.execute(sa.select(roles_table.c.code))}
    for role in ROLE_SEED_DATA:
        if role["code"] in existing_role_codes:
            continue
        bind.execute(
            roles_table.insert().values(
                id=uuid.uuid4(),
                code=role["code"],
                display_name=role["display_name"],
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "roles" in existing_tables:
        indexes = _index_names(inspector, "roles")
        if "ix_roles_code" in indexes:
            op.drop_index("ix_roles_code", table_name="roles")
        op.drop_table("roles")

    if "people" in existing_tables:
        indexes = _index_names(inspector, "people")
        if "ix_people_email" in indexes:
            op.drop_index("ix_people_email", table_name="people")
        op.drop_table("people")
