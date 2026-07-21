"""reconcile PersonRole with legacy User.role (identity capability transition slice B11)

Revision ID: e1c4b7a9d2f6
Revises: d5a9e2c7f3b1
Create Date: 2026-07-21

Phase 3C Slice B11: no schema change - person_roles already has every
column this migration needs (added in Slice B3). PersonRole backfill
has only ever run once, at Slice B3's own deploy (see
PHASE3C_SLICE_B11_ARCHITECTURE_REVIEW.md): every account created since
then has zero PersonRole rows and resolves entirely through the legacy
User.role fallback, and any account whose role was changed via the
admin UI before this slice's code shipped may have an active
PersonRole that disagrees with its current User.role (the divergence
bug this slice's code fix, in api/routers/auth.py, closes going
forward).

This migration closes both gaps retroactively, once, for every
existing Person: ensures their active PersonRole set matches their
current User.role exactly, treating User.role as ground truth for
this one-time reconciliation (it's the only field the only role-
management UI in this application has ever written). Idempotent -
recomputes from current state every time, so replaying it after this
slice's code has already been running for a while is a safe no-op.
"""

from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "e1c4b7a9d2f6"
down_revision: Union[str, Sequence[str], None] = "d5a9e2c7f3b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

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
    person_roles_table = sa.table(
        "person_roles",
        sa.column("id", sa.UUID()),
        sa.column("person_id", sa.UUID()),
        sa.column("role_code", sa.String()),
        sa.column("status", sa.String()),
    )

    existing_role_codes = {row[0] for row in bind.execute(sa.select(roles_table.c.code))}

    # Every (person_id, role_code) row that exists today, regardless of
    # status, so we can tell "missing" apart from "exists but revoked".
    all_grants = bind.execute(
        sa.select(
            person_roles_table.c.person_id,
            person_roles_table.c.role_code,
            person_roles_table.c.status,
        )
    ).fetchall()

    grant_status = {(row.person_id, row.role_code): row.status for row in all_grants}
    active_role_codes_by_person: dict = {}
    for row in all_grants:
        if row.status == "active":
            active_role_codes_by_person.setdefault(row.person_id, set()).add(row.role_code)

    join_query = sa.select(people_table.c.id, users_table.c.role).select_from(
        people_table.join(users_table, people_table.c.user_id == users_table.c.id)
    )

    for person_id, legacy_role in bind.execute(join_query):
        if legacy_role not in existing_role_codes:
            # No matching Role row - nothing to reconcile against,
            # exactly the same safety net B3's original backfill used.
            continue

        currently_active = active_role_codes_by_person.get(person_id, set())

        # Revoke any active grant that disagrees with the current
        # legacy role - closes the divergence bug retroactively.
        for stale_role_code in currently_active - {legacy_role}:
            bind.execute(
                person_roles_table.update()
                .where(
                    person_roles_table.c.person_id == person_id,
                    person_roles_table.c.role_code == stale_role_code,
                )
                .values(status="revoked")
            )

        if legacy_role in currently_active:
            continue  # already correct - nothing to do for this person

        key = (person_id, legacy_role)
        if key in grant_status:
            # Row exists but is revoked - reactivate it rather than
            # inserting a second row for the same (person_id, role_code),
            # which the unique constraint would reject.
            bind.execute(
                person_roles_table.update()
                .where(
                    person_roles_table.c.person_id == person_id,
                    person_roles_table.c.role_code == legacy_role,
                )
                .values(status="active")
            )
        else:
            bind.execute(
                person_roles_table.insert().values(
                    id=uuid.uuid4(),
                    person_id=person_id,
                    role_code=legacy_role,
                    status="active",
                )
            )


def downgrade() -> None:
    # No safe, generic downgrade: this migration only reconciles rows
    # in an already-existing table (Slice B3), it does not own the
    # table's schema, and the rows/status changes it makes are
    # indistinguishable from ones created by continuous issuance
    # (Slice B11's application code) or by B3's own original backfill.
    # Same honest no-op as d5a9e2c7f3b1_backfill_person_gap_window.py.
    pass
