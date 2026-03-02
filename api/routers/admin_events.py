from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from api.crud.participants import promote_from_waitlist
from api.db.session import get_db
from api.dependencies import require_admin
from api.models.events import Event
from api.schemas.events import AdminEventListOut, EventOut, EventUpdate

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
from uuid import UUID
from api.schemas.events import EventUpdate, EventOut

@router.put("/{event_id}", response_model=EventOut)
def update_event(
    event_id: UUID,
    update_data: EventUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Apply partial updates safely
    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)

    # Compute derived values AFTER refresh
    participant_count = len([
        p for p in event.participants
        if not p.is_waitlisted
    ])

    return EventOut(
    id=event.id,
    title=event.title,
    slug=event.slug,
    event_type=event.event_type,
    status=event.status,
    start_date=event.start_date,
    end_date=event.end_date,
    start_time=event.start_time,
    end_time=event.end_time,
    timezone=event.timezone,
    location={
        "venue": event.venue,
        "city": event.city,
        "state": event.state,
        "latitude": event.latitude,
        "longitude": event.longitude,
        "beach_accessibility": event.beach_accessibility,
    },
    capacity={
        "participants": event.participant_capacity,
        "volunteers": event.volunteer_capacity,
    },
    registration={
        "participant_open": event.participant_open,
        "volunteer_open": event.volunteer_open,
        "vendor_open": event.vendor_open,
    },
    availability={
        "participant_available": (
            event.participant_open
            and (
                event.participant_capacity is None
                or len([p for p in event.participants if not p.is_waitlisted]) < event.participant_capacity
            )
        ),
        "volunteer_available": (
            event.volunteer_open
            and (
                event.volunteer_capacity is None
                or event.volunteer_capacity > 0
            )
        ),
    },
    featured_image=event.featured_image,
)
# 🔹 Delete event
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

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.checked_in = True
    participant.checked_in_at = datetime.utcnow()

    db.commit()
    db.refresh(participant)

    return {
        "message": "Participant checked in",
        "checked_in_at": participant.checked_in_at
    }