from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.crud.events import get_event_by_slug
from api.crud.participants import create_participant, get_confirmed_participant_count
from api.models.participants import Participant
from api.models.person import Person
from api.models.users import User
from api.schemas.participants import ParticipantCreate, PublicEventRegister
from api.services.authorization import ROLE_PARTICIPANT, normalize_role

# Canonical public participant self-registration flow. Both public registration
# routes in api/routers/events.py (POST /events/{slug}/participants and
# POST /public/events/{slug}/register) delegate here rather than each
# maintaining their own event-lookup/capacity/waitlist logic.
def register_public_participant(
    db: Session,
    slug: str,
    participant_in: ParticipantCreate | PublicEventRegister,
    *,
    current_user: User | None = None,
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

    participant = create_participant(db, event, participant_in, is_waitlisted=is_waitlisted)

    # Link the new record to the caller's own account only when they're
    # authenticated as a participant-role user. An admin (or any other role)
    # token happening to be presented against this public endpoint should
    # not claim ownership of the resulting row.
    if current_user is not None and normalize_role(current_user.role) == ROLE_PARTICIPANT:
        participant.user_id = current_user.id

        # Phase 3B Slice B7: parallel identity-write-path bookkeeping.
        # person_id is not yet read by any ownership check anywhere -
        # user_id remains authoritative. Every account created since
        # Slice B7 has a Person (api/routers/auth.py); older accounts
        # from the gap window were backfilled by migration d5a9e2c7f3b1;
        # a None lookup result here (e.g. a not-yet-backfilled edge case)
        # simply leaves person_id null, same as it is today.
        person = db.query(Person).filter(Person.user_id == current_user.id).first()
        if person is not None:
            participant.person_id = person.id

    return participant
