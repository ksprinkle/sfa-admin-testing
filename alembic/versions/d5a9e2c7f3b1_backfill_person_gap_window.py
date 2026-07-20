"""backfill Person for any User missing one (identity foundation slice B7)

Revision ID: d5a9e2c7f3b1
Revises: c8f2b6a4d1e9
Create Date: 2026-07-20

Phase 3B Slice B7: no schema change. Slice B1 backfilled a Person for
every User that existed at that migration's deploy time; any User
created between then and this slice (Slice B7 starts creating a
Person at registration time going forward, in api/routers/auth.py)
has no Person yet. This migration closes that gap by re-running
exactly B1's backfill logic - idempotent, safe to replay, identical
in shape to f3a8d1c6b9e2_add_person_and_role_tables.py's own backfill.
"""

from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "d5a9e2c7f3b1"
down_revision: Union[str, Sequence[str], None] = "c8f2b6a4d1e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    people_table = sa.table(
        "people",
        sa.column("id", sa.UUID()),
        sa.column("user_id", sa.String()),
        sa.column("email", sa.String()),
    )
    users_table = sa.table(
        "users",
        sa.column("id", sa.String()),
        sa.column("email", sa.String()),
    )

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


def downgrade() -> None:
    # No safe, generic downgrade: this migration only backfills rows into
    # an already-existing table (Slice B1), it does not own the table's
    # schema. Rows it inserted are indistinguishable from B1's own
    # backfill and from rows created going forward by Slice B7's
    # registration-time Person creation - nothing to reverse here.
    pass
