from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from api.db.session import get_db
from api.crud.events import get_upcoming_events
from api.models.events import Event
from api.schemas.events import EventOut
from fastapi import HTTPException
from api.crud.events import get_event_by_slug
from api.security import is_admin
from api.schemas.events import EventCreate
from api.crud.events import create_event
from datetime import date
from typing import Optional
from datetime import date
from typing import Optional
from api.schemas.events import EventUpdate
from api.crud.events import update_event
from api.schemas.participants import ParticipantCreate, ParticipantOut
from api.crud.participants import create_participant
from api.crud.participants import get_participant_count
from api.crud.participants import get_participants_for_event
from api.schemas.events import EventOut, EventListOut

router = APIRouter(prefix="/events", tags=["Events"])

@router.get("", response_model=list[EventListOut])
def list_events(
    db: Session = Depends(get_db),
    admin: bool = Depends(is_admin),
    state: Optional[str] = None,
    event_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
):
    events = get_upcoming_events(
        db,
        is_admin=admin,
        state=state,
        event_type=event_type,
        start_date=start_date,
        end_date=end_date,
    )

    return [
        EventListOut(
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
        )
        for e in events
    ]
    
@router.get("/{slug}", response_model=EventOut)
def get_event(
    slug: str,
    db: Session = Depends(get_db),
    admin: bool = Depends(is_admin),
):
    event: Event | None = get_event_by_slug(db, slug, is_admin=admin)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # ✅ DEFINE count (no enforcement here)
    participant_count = get_participant_count(db, event.id)

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
                    or participant_count < event.participant_capacity
                )
            ),
            "volunteer_available": (
                event.volunteer_open
                and (
                    event.volunteer_capacity is None
                    or event.volunteer_count < event.volunteer_capacity
                )
            ),
        },
        featured_image=event.featured_image,
    )

@router.get("/{slug}/participants", response_model=list[ParticipantOut])
def list_event_participants(
    slug: str,
    db: Session = Depends(get_db),
):
    event = get_event_by_slug(db, slug, is_admin=False)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = get_participants_for_event(db, event.id)

    return [
        ParticipantOut(
            id=str(p.id),
            first_name=p.first_name,
            last_name=p.last_name,
            email=p.email,
        )
        for p in participants
    ]
   

@router.post("", response_model=EventOut, status_code=201)
def create_event_endpoint(
    event_in: EventCreate,
    db: Session = Depends(get_db),
    admin: bool = Depends(is_admin),
):
    if not admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    event = create_event(db, event_in)

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
                    or event.participant_count < event.participant_capacity
                )
            ),
            "volunteer_available": (
                event.volunteer_open
                and (
                    event.volunteer_capacity is None
                    or event.volunteer_count < event.volunteer_capacity
                )
            ),
        },
        featured_image=event.featured_image,
    )
@router.put("/{slug}", response_model=EventOut)
def update_event_endpoint(
    slug: str,
    event_in: EventUpdate,
    db: Session = Depends(get_db),
    admin: bool = Depends(is_admin),
):
    if not admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    event = get_event_by_slug(db, slug, is_admin=True)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event = update_event(db, event, event_in)
    participant_count = get_participant_count(db, event.id)
    
    if (
    event.participant_capacity is not None
    and participant_count >= event.participant_capacity
):
        raise HTTPException(status_code=400, detail="Event is full")
        
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
                    or event.participant_count < event.participant_capacity
                )
            ),
            "volunteer_available": (
                event.volunteer_open
                and (
                    event.volunteer_capacity is None
                    or event.volunteer_count < event.volunteer_capacity
                )
            ),
        },
        featured_image=event.featured_image,
    )
@router.post("/{slug}/participants", response_model=ParticipantOut, status_code=201)
def signup_participant(
    slug: str,
    participant_in: ParticipantCreate,
    db: Session = Depends(get_db),
):
    event = get_event_by_slug(db, slug, is_admin=False)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not event.participant_open:
        raise HTTPException(status_code=400, detail="Participant registration is closed")

    participant_count = get_participant_count(db, event.id)

    if (
        event.participant_capacity is not None
        and participant_count >= event.participant_capacity
    ):
        raise HTTPException(status_code=400, detail="Event is full")

    participant = create_participant(db, event, participant_in)

    return ParticipantOut(
        id=str(participant.id),
        first_name=participant.first_name,
        last_name=participant.last_name,
        email=participant.email,
    )
