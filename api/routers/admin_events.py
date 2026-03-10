from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from api.crud.participants import promote_from_waitlist
from api.db.session import get_db
from api.dependencies import require_admin
from api.models import events
from api.models.events import Event
from api.schemas.events import AdminEventListOut, EventOut, EventUpdate
from sqlalchemy.orm import joinedload
from api.utils.event_builder import build_admin_event

router = APIRouter(
    prefix="/admin/events",
    tags=["Admin Events"],
)

# 🔹 List all events (admin view)
@router.get("/", response_model=List[AdminEventListOut])
def list_all_events(
    skip: int = 0,
    limit: int = 10,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    query = db.query(Event).options(joinedload(Event.participants))

    if status:
        query = query.filter(Event.status == status)

    events = query.offset(skip).limit(limit).all()

    return [build_admin_event(e) for e in events]

# 🔹 Update event
from uuid import UUID
from api.schemas.events import EventUpdate, EventOut

@router.put("/{event_id}", response_model=EventOut)
def update_event(
    event_id: UUID,
    update_data: EventUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = (
    db.query(Event)
    .options(joinedload(Event.participants))
    .filter(Event.id == event_id)
    .first()
)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    from api.crud.events import update_event as crud_update_event

    event = crud_update_event(db, event, update_data)
    
    return build_admin_event(event)

# 🔹 Delete Participant
@router.delete("/{event_id}/participants/{participant_id}")
def remove_participant(
    event_id: UUID,
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participant = (
        db.query(Participant)
        .filter(
            Participant.id == participant_id,
            Participant.event_id == event_id,
        )
        .first()
    )

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    was_waitlisted = participant.is_waitlisted

    db.delete(participant)
    db.commit()

    if not was_waitlisted:
        promote_from_waitlist(db, event)

    return {"message": "Participant removed"}
   
@router.delete("/{event_id}")
def delete_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(event)
    db.commit()

    return {"message": "Event deleted"}

from api.models.participants import Participant
from api.schemas.participants import ParticipantOut
from typing import List


@router.get("/{event_id}/participants", response_model=List[ParticipantOut])
def list_event_participants(
    event_id: UUID,
    checked_in: bool | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    query = db.query(Participant).filter(
        Participant.event_id == event_id
    )

    if checked_in is not None:
        query = query.filter(Participant.checked_in == checked_in)

    return query.all()

from api.schemas.events import AdminEventSummary


@router.get("/{event_id}/summary", response_model=AdminEventSummary)
def event_summary(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    from sqlalchemy.orm import joinedload

    event = (
        db.query(Event)
        .options(joinedload(Event.participants))
        .filter(Event.id == event_id)
        .first()
    )

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = event.participants

    surfers = 0
    waitlisted = 0
    checked_in = 0
    volunteers = 0

    for p in participants:
        if p.is_waitlisted:
            waitlisted += 1
        else:
            surfers += 1

        if p.checked_in:
            checked_in += 1

    participant_remaining = None
    participant_fill_percent = None
    volunteer_remaining = None
    volunteer_fill_percent = None

    if event.participant_capacity:
        participant_remaining = max(
            event.participant_capacity - surfers, 0
        )

        participant_fill_percent = round(
            (surfers / event.participant_capacity) * 100, 2
        )

    return {
        "event_id": event.id,
        "title": event.title,
        "status": event.status,

        "participant_count": surfers,
        "waitlist_count": waitlisted,
        "checked_in_count": checked_in,

        "participant_capacity": event.participant_capacity,
        "participant_remaining": participant_remaining,
        "participant_fill_percent": participant_fill_percent,

        "volunteer_count": volunteers,
        "volunteer_capacity": event.volunteer_capacity,
        "volunteer_remaining": volunteer_remaining,
        "volunteer_fill_percent": volunteer_fill_percent,
}
from datetime import datetime

@router.patch("/{event_id}/participants/{participant_id}/checkin")
def check_in_participant(
    event_id: UUID,
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    participant = (
        db.query(Participant)
        .filter(
            Participant.id == participant_id,
            Participant.event_id == event_id
        )
        .first()
    )

    if not participant.waiver_verified:
        raise HTTPException(
            status_code=400,
            detail="Waiver not verified"
        )
    participant.checked_in = True
    participant.checked_in_at = datetime.utcnow()

    db.commit()
    db.refresh(participant)

    return {
        "message": "Participant checked in",
        "checked_in_at": participant.checked_in_at
    }
@router.get("/participants")
def list_all_participants(
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):

    participants = (
        db.query(Participant)
        .options(joinedload(Participant.event))
        .all()
    )

    return [
        {
            "id": p.id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "email": p.email,
            "checked_in": p.checked_in,
            "is_waitlisted": p.is_waitlisted,
            "event_title": p.event.title if p.event else None,
        }
        for p in participants
    ]
@router.get("/{event_id}", response_model=AdminEventListOut)
def get_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participant_count = len(
        [p for p in event.participants if not p.is_waitlisted]
    )

    waitlist_count = len(
        [p for p in event.participants if p.is_waitlisted]
    )

    checked_in_count = len(
        [p for p in event.participants if p.checked_in]
    )

    return build_admin_event(event)
