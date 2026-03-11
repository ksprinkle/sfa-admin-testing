from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from api.crud.participants import promote_from_waitlist
from api.db.session import get_db
from api.dependencies import require_admin
from api.models import events
from api.models.events import Event
from api.schemas.events import AdminEventListOut, EventOut, EventUpdate, EventCreate
from api.crud.events import create_event as crud_create_event
from sqlalchemy.orm import joinedload
from api.utils.event_builder import build_admin_event
from api.models.participants import Participant
from api.schemas.events import AdminEventSummary
from uuid import UUID
from datetime import datetime

router = APIRouter(
    prefix="/admin/events",
    tags=["Admin Events"],
)

#🔹 Create new event
@router.post("/", response_model=EventOut, status_code=201)
def create_event(
    event_in: EventCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = crud_create_event(db, event_in)

    return build_admin_event(event)

#🔹 Get event details (admin view)
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

# 🔹 Get event summary
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
@router.put("/{event_id}", response_model=AdminEventListOut)
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

# 🔹 Delete event
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







