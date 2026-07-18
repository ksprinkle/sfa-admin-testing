from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.participants import Participant
from api.models.users import User


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
