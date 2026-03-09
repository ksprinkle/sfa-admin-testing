from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from api.crud.participants import promote_from_waitlist
from api.db.session import get_db
from api.dependencies import require_admin
from api.models.events import Event
from api.schemas.events import AdminEventListOut, EventOut, EventUpdate
from sqlalchemy.orm import joinedload

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

    events = query.offset(skip).limit(limit).all()

    return [
    AdminEventListOut(
        id=e.id,
        title=e.title,
        slug=e.slug,
        event_type=e.event_type,
        status=e.status,
        start_date=e.start_date,
        end_date=e.end_date,
        start_time=e.start_time,
        end_time=e.end_time,
        timezone=e.timezone,
        location={
            "venue": e.venue,
            "city": e.city,
            "state": e.state,
            "latitude": e.latitude,
            "longitude": e.longitude,
            "beach_accessibility": e.beach_accessibility,
        },
        capacity={
            "participants": e.participant_capacity,
            "volunteers": e.volunteer_capacity,
        },
        registration={
            "participant_open": e.participant_open,
            "volunteer_open": e.volunteer_open,
            "vendor_open": e.vendor_open,
        },
        availability={
            "participant_available": (
                e.participant_open
                and (
                    e.participant_capacity is None
                    or len([p for p in e.participants if not p.is_waitlisted]) < e.participant_capacity
                )
            ),
            "volunteer_available": (
                e.volunteer_open
                and (
                    e.volunteer_capacity is None
                    or e.volunteer_capacity > 0
                )
            ),
        },
        featured_image=e.featured_image,

        participant_count=len(
            [p for p in e.participants if not p.is_waitlisted]
        ),

        waitlist_count=len(
            [p for p in e.participants if p.is_waitlisted]
        ),

        checked_in_count=len(
            [p for p in e.participants if p.checked_in]
        ),
    )
    for e in events
]



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
    from api.crud.events import promote_waitlist

    promote_waitlist(db, event)
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

    return AdminEventListOut(
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
                    or participant_count < event.participant_capacity
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
        participant_count=participant_count,
        waitlist_count=waitlist_count,
        checked_in_count=checked_in_count,
    )
from uuid import UUID
from fastapi import HTTPException
from api.models.participants import Participant

@router.post("/participants/{participant_id}/checkin")
def check_in_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    participant = db.query(Participant).filter(
        Participant.id == participant_id
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.checked_in = True

    db.commit()
    db.refresh(participant)

    return {
        "status": "checked_in",
        "participant_id": participant.id
    }
from uuid import UUID
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_admin
from api.models.participants import Participant


@router.post("/{participant_id}/checkin")
def check_in_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    participant = db.query(Participant).filter(
        Participant.id == participant_id
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.checked_in = True
    db.commit()
    db.refresh(participant)

    return {"status": "checked_in"}