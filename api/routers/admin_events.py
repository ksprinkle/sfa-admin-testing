from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from api.db.session import get_db
from api.dependencies import require_admin
from api.models.events import Event
from api.schemas.events import AdminEventListOut, EventUpdate

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
    query = db.query(Event)

    if status:
        query = query.filter(Event.status == status)

    return (
        query
        .offset(skip)
        .limit(limit)
        .all()
    )


# 🔹 Update event
@router.put("/{event_id}", response_model=AdminEventListOut)
def update_event(
    event_id: str,
    update_data: EventUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)

    return event

# 🔹 Delete event
@router.delete("/{event_id}", response_model=AdminEventListOut)
def archive_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event.status = "archived"

    db.commit()
    db.refresh(event)
    
    print("Archiving event:", event.id, "Current status:", event.status)
    event.status = "archived"
    db.commit()
    print("After commit status:", event.status)
    
    return event
   

from api.models.participants import Participant
from api.schemas.participants import ParticipantOut
from typing import List


@router.get("/{event_id}/participants", response_model=List[ParticipantOut])
def list_event_participants(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    participants = (
        db.query(Participant)
        .filter(Participant.event_id == event_id)
        .all()
    )

    return participants

from api.schemas.events import AdminEventSummary


@router.get("/{event_id}/summary", response_model=AdminEventSummary)
def event_summary(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participant_remaining = None
    participant_fill_percent = None
    volunteer_remaining = None
    volunteer_fill_percent = None

    if event.participant_capacity:
        participant_remaining = max(
            event.participant_capacity - event.participant_count, 0
        )
        participant_fill_percent = round(
            (event.participant_count / event.participant_capacity) * 100, 2
        )

    if event.volunteer_capacity:
        volunteer_remaining = max(
            event.volunteer_capacity - event.volunteer_count, 0
        )
        volunteer_fill_percent = round(
            (event.volunteer_count / event.volunteer_capacity) * 100, 2
        )

    return {
        "event_id": event.id,
        "title": event.title,
        "status": event.status,

        "participant_count": event.participant_count,
        "participant_capacity": event.participant_capacity,
        "participant_remaining": participant_remaining,
        "participant_fill_percent": participant_fill_percent,

        "volunteer_count": event.volunteer_count,
        "volunteer_capacity": event.volunteer_capacity,
        "volunteer_remaining": volunteer_remaining,
        "volunteer_fill_percent": volunteer_fill_percent,
    }