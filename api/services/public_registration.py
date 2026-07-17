from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.crud.events import get_event_by_slug
from api.crud.participants import create_participant, get_confirmed_participant_count
from api.models.participants import Participant
from api.schemas.participants import ParticipantCreate, PublicEventRegister

# Canonical public participant self-registration flow. Both public registration
# routes in api/routers/events.py (POST /events/{slug}/participants and
# POST /public/events/{slug}/register) delegate here rather than each
# maintaining their own event-lookup/capacity/waitlist logic.
def register_public_participant(
    db: Session,
    slug: str,
    participant_in: ParticipantCreate | PublicEventRegister,
) -> Participant:
    event = get_event_by_slug(db, slug, is_admin=False)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not event.participant_open:
        raise HTTPException(status_code=400, detail="Participant registration is closed")

    confirmed_count = get_confirmed_participant_count(db, event.id)

    is_waitlisted = (
        event.participant_capacity is not None
        and confirmed_count >= event.participant_capacity
    )

    return create_participant(db, event, participant_in, is_waitlisted=is_waitlisted)
