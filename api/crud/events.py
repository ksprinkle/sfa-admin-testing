from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from models.events import Event
from models.sessions import Session as EventSession
from schemas.events import EventCreate
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from utils.slug import generate_unique_slug
from crud.participants import promote_from_waitlist
import math


def create_event(db: Session, event_in: EventCreate):

    slug = generate_unique_slug(db, Event, event_in.title)

    event = Event(
        **event_in.model_dump(exclude={"slug"}),
        slug=slug,
    )

    db.add(event)

    # Auto-create sessions if participant_capacity is set
    if event.participant_capacity and event.start_date and event.start_time:
        num_sessions = math.ceil(event.participant_capacity / 15)
        base_time = datetime.combine(event.start_date, event.start_time)

        for i in range(num_sessions):
            start_time = base_time + timedelta(hours=i)
            end_time = start_time + timedelta(hours=1)

            session = EventSession(
                event_id=event.id,
                name=f"Session {i+1}",
                start_time=start_time,
                end_time=end_time,
                capacity=15,
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
    return event


from sqlalchemy.orm import Session
from datetime import date
from models.events import Event
from schemas.events import EventUpdate


def update_event(db: Session, event: Event, event_in: EventUpdate):
    update_data = event_in.dict(exclude_unset=True)

    for field, value in update_data.items():
        setattr(event, field, value)

    db.commit()
    db.refresh(event)

    # ALWAYS run waitlist promotion after update
    promote_waitlist(db, event)

    db.commit()
    db.refresh(event)

    return event

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
):

    query = db.query(Event)

    if state:
        state = state.strip().lower()

    if event_type:
        event_type = event_type.strip().lower()

    if not is_admin:
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
    query = db.query(Event).filter(Event.slug == slug)

    if not is_admin:
        query = query.filter(Event.status == "published")

    return query.first()
from sqlalchemy.orm import Session
from models.events import Event
from models.participants import Participant


def promote_waitlist(db: Session, event: Event):
    """
    Promote waitlisted participants if capacity allows.
    Promotes in order of signup (created_at ascending).
    """
    print("PROMOTE WAITLIST TRIGGERED")

    # Unlimited capacity → promote everyone
    if event.participant_capacity is None:
        while promote_from_waitlist(db, event):
            continue

        db.refresh(event)
        print("UNLIMITED CAPACITY PROMOTION")
        return

    # Count confirmed
    confirmed_count = (
        db.query(Participant)
        .filter(
            Participant.event_id == event.id,
            Participant.is_waitlisted == False,
        )
        .count()
    )

    available_spots = event.participant_capacity - confirmed_count

    if available_spots <= 0:
        return

    for _ in range(available_spots):
        if not promote_from_waitlist(db, event):
            break