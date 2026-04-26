from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from api.db.session import get_db
from api.crud.events import get_upcoming_events
from api.models.events import Event
from api.models.participants import Participant as ParticipantModel
from api.schemas.events import EventOut
from fastapi import HTTPException
from api.crud.events import get_event_by_slug
from api.schemas.events import EventCreate
from api.crud.events import create_event
from datetime import date, timedelta
from typing import Optional
from datetime import date
from typing import Optional
from api.schemas.events import EventUpdate
from api.crud.events import update_event
from api.schemas.participants import ParticipantCreate, ParticipantOut, VolunteerSignup
from api.crud.participants import create_participant
from api.crud.participants import get_confirmed_participant_count
from api.crud.participants import get_participants_for_event
from api.schemas.events import EventOut, EventListOut
from api.dependencies import get_current_user, require_admin
from api.utils.event_counts import (
    surfer_count,
    waitlist_count,
    volunteer_count,
    checked_in_count,
)
from sqlalchemy import func
router = APIRouter(prefix="/events", tags=["Events"])

# PUBLIC List upcoming events with optional filters and participant counts
@router.get("", response_model=list[EventListOut])
def list_events(
    db: Session = Depends(get_db),
    state: Optional[str] = None,
    event_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    sort: Optional[str] = "start_date",
):

    events = get_upcoming_events(
        db,
        state=state,
        event_type=event_type,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
        sort=sort,
    )


    event_list = []

    for e in events:
        participant_count = get_confirmed_participant_count(db, e.id)

        event_list.append(
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
                participant_count=participant_count,
                participant_capacity=e.participant_capacity,
                participant_available=(
                    e.participant_open
                    and (
                        e.participant_capacity is None
                        or participant_count < e.participant_capacity
                    )
                ),
            )
        )

    return event_list

# PUBLIC Get event details by slug (with participant count)    
@router.get("/{slug}", response_model=EventOut)
def get_event(
    slug: str,
    db: Session = Depends(get_db),
):
    event: Event | None = get_event_by_slug(db, slug, is_admin=False)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # ✅ DEFINE count (no enforcement here)
    participant_count = get_confirmed_participant_count(db, event.id)

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
            "exhibitor_open": event.exhibitor_open,
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
        website_schedule_published=event.website_schedule_published,
        beach_access_notes=event.beach_access_notes,
        directions=event.directions,
        parking_info=event.parking_info,
        lodging_info=event.lodging_info,
        weather_report_url=event.weather_report_url,
        surf_report_url=event.surf_report_url,
        featured_image=event.featured_image,
    )

# PUBLIC participant signup for an event (with waitlist handling)
@router.post("/{slug}/participants", response_model=ParticipantOut, status_code=201)
def signup_participant(
    slug: str,
    participant_in: ParticipantCreate,
    db: Session = Depends(get_db),
):
    event = get_event_by_slug(db, slug, is_admin=True)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not event.participant_open:
        raise HTTPException(status_code=400, detail="Participant registration is closed")

    confirmed_count = get_confirmed_participant_count(db, event.id)

    is_waitlisted = False

    if (
        event.participant_capacity is not None
        and confirmed_count >= event.participant_capacity
    ):
        is_waitlisted = True

    participant = create_participant(
        db,
        event,
        participant_in,
        is_waitlisted=is_waitlisted,
    )

    db.commit()
    db.refresh(participant)

    return participant

# PUBLIC volunteer self-registration for an event
# food / raffle : open as soon as volunteer_open is True
# beach / instructor / buddy : open only within 14 days of the event
_BEACH_RESTRICTED = {"beach", "instructor", "buddy"}

@router.post("/{slug}/volunteers", response_model=ParticipantOut, status_code=201)
def signup_volunteer(
    slug: str,
    volunteer_in: VolunteerSignup,
    db: Session = Depends(get_db),
):
    event = get_event_by_slug(db, slug, is_admin=True)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not event.volunteer_open:
        raise HTTPException(status_code=400, detail="Volunteer registration is closed")

    selected_roles = {volunteer_in.volunteer_type, *volunteer_in.volunteer_additional_types}

    if selected_roles.intersection(_BEACH_RESTRICTED):
        days_until = (event.start_date - date.today()).days
        if days_until > 14:
            open_date = event.start_date - timedelta(days=14)
            raise HTTPException(
                status_code=400,
                detail=(
                    "Beach, Instructor, and Buddy volunteer roles may only register within 14 days of the event. "
                    f"Registration opens {open_date.strftime('%B %d, %Y').replace(' 0', ' ')}."
                ),
            )

    confirmed_vol_count = (
        db.query(func.count(ParticipantModel.id))
        .filter(
            ParticipantModel.event_id == event.id,
            ParticipantModel.removed_at.is_(None),
            func.lower(func.trim(func.coalesce(ParticipantModel.role, ""))) == "volunteer",
            ParticipantModel.is_waitlisted == False,
        )
        .scalar()
    )

    is_waitlisted = (
        event.volunteer_capacity is not None
        and confirmed_vol_count >= event.volunteer_capacity
    )

    participant_in = ParticipantCreate(
        event_id=event.id,
        first_name=volunteer_in.first_name,
        last_name=volunteer_in.last_name,
        email=volunteer_in.email,
        role="volunteer",
        is_minor=volunteer_in.is_minor,
        volunteer_type=volunteer_in.volunteer_type,
        volunteer_additional_types=volunteer_in.volunteer_additional_types,
        volunteer_is_versatile=volunteer_in.volunteer_is_versatile,
    )

    participant = create_participant(db, event, participant_in, is_waitlisted=is_waitlisted)

    db.commit()
    db.refresh(participant)

    return participant


def build_event_out(event: Event) -> EventOut:
    participant_count = len([
        p for p in event.participants
        if p.removed_at is None and not p.is_waitlisted
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
            "participant_capacity": event.participant_capacity,
            "volunteer_capacity": event.volunteer_capacity,
        },
        registration={
            "participant_open": event.participant_open,
            "volunteer_open": event.volunteer_open,
            "exhibitor_open": event.exhibitor_open,
        },
        availability={
            "participant_count": participant_count,
            "participant_available": (
                event.participant_open
                and (
                    event.participant_capacity is None
                    or participant_count < event.participant_capacity
                )
            ),
        },
        website_schedule_published=event.website_schedule_published,
        beach_access_notes=event.beach_access_notes,
        directions=event.directions,
        parking_info=event.parking_info,
        lodging_info=event.lodging_info,
        weather_report_url=event.weather_report_url,
        surf_report_url=event.surf_report_url,
    )

# ADMIN-ONLY List participants for an event (with waitlist status)
@router.get("/{slug}/participants", response_model=list[ParticipantOut])
def list_participants(
    slug: str,
    db: Session = Depends(get_db),
    admin: bool = Depends(require_admin),
):
    if not admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    event = get_event_by_slug(db, slug, is_admin=False)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = get_participants_for_event(db, event.id)

    return participants
   


