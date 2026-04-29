from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from api.models.events import Event
from api.models.event_activity_log import EventActivityLog
from api.models.sessions import Session as EventSession
from schemas.events import EventCreate
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from utils.slug import generate_unique_slug
from api.crud.participants import promote_from_waitlist
from services.session_service import (
    DEFAULT_SESSION_CAPACITY,
    create_next_tour_session,
    is_tour_event,
)
import math

AUTO_PUBLISH_DAYS_BEFORE_START = 14


def _active_participant_counts(event: Event) -> tuple[int, int, int]:
    active_participants = [p for p in (event.participants or []) if p.removed_at is None]
    participant_count = len([p for p in active_participants if not p.is_waitlisted])
    waitlist_count = len([p for p in active_participants if p.is_waitlisted])
    checked_in_count = len([p for p in active_participants if p.checked_in])
    return participant_count, waitlist_count, checked_in_count


def create_event_activity_log(
    db: Session,
    event: Event,
    *,
    action_type: str,
    previous_status: str | None = None,
    new_status: str | None = None,
    reason_code: str | None = None,
    reason_note: str | None = None,
    actor_user_id: str | None = None,
    actor_user_email: str | None = None,
) -> None:
    participant_count, waitlist_count, checked_in_count = _active_participant_counts(event)

    db.add(
        EventActivityLog(
            event_id=str(event.id),
            event_title=event.title,
            event_type=event.event_type,
            action_type=action_type,
            previous_status=previous_status,
            new_status=new_status,
            reason_code=reason_code,
            reason_note=(reason_note or "").strip() or None,
            actor_user_id=(actor_user_id or "").strip() or None,
            actor_user_email=(actor_user_email or "").strip() or None,
            participant_count=participant_count,
            waitlist_count=waitlist_count,
            checked_in_count=checked_in_count,
        )
    )


def create_event(db: Session, event_in: EventCreate):

    slug = generate_unique_slug(db, Event, event_in.title)

    event = Event(
        **event_in.model_dump(exclude={"slug"}),
        slug=slug,
    )

    db.add(event)
    # Ensure event.id is available before creating child session rows.
    db.flush()

    # Auto-create sessions.
    # - Tour: start with one 20-minute session and expand dynamically as needed.
    # - Chapter/non-tour: pre-create hourly sessions based on participant capacity.
    if event.start_date and event.start_time:
        if is_tour_event(event.event_type):
            create_next_tour_session(db, event, existing_sessions=[])
        elif event.participant_capacity:
            num_sessions = math.ceil(event.participant_capacity / DEFAULT_SESSION_CAPACITY)
            base_time = datetime.combine(event.start_date, event.start_time)

            for i in range(num_sessions):
                start_time = base_time + timedelta(hours=i)
                end_time = start_time + timedelta(hours=1)

                session = EventSession(
                    event_id=event.id,
                    name=f"Session {i+1}",
                    start_time=start_time,
                    end_time=end_time,
                    capacity=DEFAULT_SESSION_CAPACITY,
                )
                db.add(session)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Error creating event"
        )

    db.refresh(event)

    # Apply automatic publication/registration rules immediately after creation.
    auto_publish_and_open_participant_registration(db)
    db.refresh(event)

    return event


from sqlalchemy.orm import Session
from datetime import date
from api.models.events import Event
from sqlalchemy import func
from schemas.events import EventUpdate


def update_event(db: Session, event: Event, event_in: EventUpdate):
    update_data = event_in.dict(exclude_unset=True)

    for field, value in update_data.items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)

    # ALWAYS run waitlist promotion after update
    promote_waitlist(db, event)

    # Reconcile automatic publication/registration rules after updates.
    auto_publish_and_open_participant_registration(db)

    db.commit()
    db.refresh(event)

    return event


def auto_publish_and_open_participant_registration(
    db: Session,
    days_before_start: int = AUTO_PUBLISH_DAYS_BEFORE_START,
):
    """
    Automatically transitions event state based on start date.

        Rules:
        - Draft events are auto-published when start_date is within N days.
        - Published events are auto-archived after end_date/start_date has passed.
        - Participant registration is auto-opened for published events within N days.
        - Volunteer and exhibitor registration auto-open when website schedule
            publication is explicitly marked true.
    """
    today = date.today()
    cutoff_date = date.today() + timedelta(days=days_before_start)

    candidates = (
        db.query(Event)
        .filter(
            Event.start_date.isnot(None),
            Event.start_date <= cutoff_date,
            Event.status.in_(["draft", "published"]),
        )
        .all()
    )

    changed = False
    for event in candidates:
        effective_end_date = event.end_date or event.start_date

        if event.status == "published" and effective_end_date and effective_end_date < today:
            previous_status = event.status
            event.status = "archived"
            if event.participant_open:
                event.participant_open = False
            if event.volunteer_open:
                event.volunteer_open = False
            if event.exhibitor_open:
                event.exhibitor_open = False
            create_event_activity_log(
                db,
                event,
                action_type="auto_archived",
                previous_status=previous_status,
                new_status="archived",
                reason_code="passed_event_date",
                reason_note="Auto-archived after event date passed",
            )
            changed = True
            continue

        if event.status == "draft":
            event.status = "published"
            changed = True

        if event.status == "published" and not event.participant_open:
            event.participant_open = True
            changed = True

        if event.website_schedule_published:
            if not event.volunteer_open:
                event.volunteer_open = True
                changed = True
            if not event.exhibitor_open:
                event.exhibitor_open = True
                changed = True

    if changed:
        db.commit()

    return changed

def get_upcoming_events(
    db: Session,
    is_admin: bool = False,
    state: str | None = None,
    event_type: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int | None = None,
    offset: int | None = None,
    sort: str | None = "start_date",
    include_all: bool = False,
):
    auto_publish_and_open_participant_registration(db)

    query = db.query(Event)

    if state:
        state = state.strip().lower()

    if event_type:
        event_type = event_type.strip().lower()

    if not is_admin and not include_all:
        query = query.filter(Event.status == "published")

    if state:
        query = query.filter(
            Event.state.isnot(None),
            Event.state.ilike(state)
        )

    if event_type:
        query = query.filter(
            Event.event_type.isnot(None),
            Event.event_type.ilike(event_type)
        )

    if start_date:
        query = query.filter(Event.start_date >= start_date)

    if end_date:
        query = query.filter(Event.start_date <= end_date)

    # RETURN MUST ALWAYS EXECUTE
    if sort == "start_date_desc":
        query = query.order_by(Event.start_date.desc())
    else:
        query = query.order_by(Event.start_date.asc())


    if offset is not None:
        query = query.offset(offset)

    if limit is not None:
        query = query.limit(limit)

    return query.all()



def get_event_by_slug(db: Session, slug: str, is_admin: bool = False):
    auto_publish_and_open_participant_registration(db)

    query = db.query(Event).filter(Event.slug == slug)

    if not is_admin:
        query = query.filter(Event.status == "published")

    return query.first()
from sqlalchemy.orm import Session
from api.models.events import Event
from api.models.participants import Participant


def promote_waitlist(db: Session, event: Event):
    """
    Promote waitlisted participants if capacity allows.
    Promotes in order of signup (created_at ascending).
    """
    # Unlimited capacity → promote everyone
    if event.participant_capacity is None:
        while promote_from_waitlist(db, event):
            continue

        db.refresh(event)
        return

    # Count confirmed
    confirmed_count = (
        db.query(Participant)
        .filter(
            Participant.event_id == event.id,
            Participant.is_waitlisted == False,
            func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
        )
        .count()
    )

    available_spots = event.participant_capacity - confirmed_count

    if available_spots <= 0:
        return

    for _ in range(available_spots):
        if not promote_from_waitlist(db, event):
            break