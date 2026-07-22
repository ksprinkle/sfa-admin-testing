"""reconcile Participant.person_id from Participant.user_id (identity capability transition slice B12)

Revision ID: f7b3d9a1c5e8
Revises: e1c4b7a9d2f6
Create Date: 2026-07-22

Phase 3C Slice B12: no schema change - participants.person_id has
existed since Slice B2. Both write paths that populate it
(api/services/public_registration.py, api/services/
participant_claiming.py) silently leave person_id null whenever the
acting user's Person didn't exist yet at that exact moment (documented
directly in their own comments) - the same gap shape Slice B10 found
for PersonRole, one layer down. A production count run before this
slice's implementation (SELECT count(*) FROM participants WHERE
user_id IS NOT NULL AND person_id IS NULL) returned 0, so this
migration is a true no-op against today's data - it exists as a
permanent, idempotent safeguard against this gap ever reopening
(e.g. a future write path that doesn't set person_id correctly),
exactly the same reasoning already applied to Slice B7's and B11's
own backfills. Nothing reads person_id yet - see
PHASE3C_SLICE_B12_ARCHITECTURE_REVIEW.md; the actual read-path switch
is Slice B13, gated on this migration's clean production verification.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7b3d9a1c5e8"
down_revision: Union[str, Sequence[str], None] = "e1c4b7a9d2f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    participants_table = sa.table(
        "participants",
        sa.column("id", sa.UUID()),
        sa.column("user_id", sa.String()),
        sa.column("person_id", sa.UUID()),
    )
    people_table = sa.table(
        "people",
        sa.column("id", sa.UUID()),
        sa.column("user_id", sa.String()),
    )

    # Map of user_id -> person_id for every existing Person - built once,
    # rather than re-querying per candidate row.
    person_id_by_user_id = {
        row.user_id: row.id
        for row in bind.execute(sa.select(people_table.c.user_id, people_table.c.id))
        if row.user_id is not None
    }

    candidates = bind.execute(
        sa.select(participants_table.c.id, participants_table.c.user_id).where(
            participants_table.c.user_id.isnot(None),
            participants_table.c.person_id.is_(None),
        )
    ).fetchall()

    for participant_id, user_id in candidates:
        person_id = person_id_by_user_id.get(user_id)
        if person_id is None:
            # No Person exists for this user at all - leave person_id
            # null, exactly matching what the write paths themselves do
            # in this same situation. Nothing to reconcile against yet.
            continue

        bind.execute(
            participants_table.update()
            .where(participants_table.c.id == participant_id)
            .values(person_id=person_id)
        )


def downgrade() -> None:
    # No safe, generic downgrade: this migration only backfills a
    # column that has existed since Slice B2, it does not own the
    # table's schema, and the values it sets are indistinguishable from
    # ones set by the normal write path (public_registration.py /
    # participant_claiming.py) succeeding on the first try. Same honest
    # no-op as d5a9e2c7f3b1 (B7) and e1c4b7a9d2f6 (B11).
    pass
