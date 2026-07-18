from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from api.models.participants import Participant
from api.models.users import User


def list_own_registrations(db: Session, *, current_user: User) -> list[Participant]:
    """
    All non-removed participant records linked to the caller's own account,
    newest first. Same ownership rule as get_own_participant_or_404() below
    (Participant.user_id == current_user.id), applied as a list filter
    instead of a single-record lookup.
    """
    return (
        db.query(Participant)
        .options(joinedload(Participant.event), joinedload(Participant.waiver))
        .filter(Participant.user_id == current_user.id, Participant.removed_at.is_(None))
        # id as a tiebreaker for deterministic ordering when created_at ties
        # (e.g. SQLite's second-resolution CURRENT_TIMESTAMP default) —
        # same pattern as crud/events.py's get_waitlist_query().
        .order_by(Participant.created_at.desc(), Participant.id.desc())
        .all()
    )


def get_own_participant_or_404(db: Session, *, participant_id: UUID, current_user: User) -> Participant:
    """
    Fetch a participant record, scoped strictly to records the caller's own
    account is linked to (Participant.user_id). Returns 404 rather than 403
    when the record exists but belongs to someone else, so this endpoint
    can't be used to enumerate other participants' record ids.
    """
    participant = (
        db.query(Participant)
        .filter(Participant.id == participant_id, Participant.removed_at.is_(None))
        .first()
    )

    if participant is None or participant.user_id is None or str(participant.user_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="Participant not found")

    return participant
