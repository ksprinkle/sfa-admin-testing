from sqlalchemy.orm import Session
from datetime import date
from models.events import Event

from schemas.events import EventCreate

from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from slugify import slugify

from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from slugify import slugify
from utils.slug import generate_unique_slug

from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from utils.slug import generate_unique_slug


def create_event(db: Session, event_in: EventCreate):

    slug = generate_unique_slug(db, Event, event_in.title)

    event = Event(
        **event_in.model_dump(exclude={"slug"}),
        slug=slug,
    )

    db.add(event)

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
        waitlisted = (
            db.query(Participant)
            .filter(
                Participant.event_id == event.id,
                Participant.is_waitlisted == True,
            )
            .order_by(Participant.created_at.asc())
            .all()
        )

        for p in waitlisted:
            p.is_waitlisted = False

        db.flush()  # Flush changes to DB before commit
        db.commit()  # Commit here to save changes before refreshing event
        db.refresh(event)  # Refresh event to get updated participant counts

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

    waitlisted = (
        db.query(Participant)
        .filter(
            Participant.event_id == event.id,
            Participant.is_waitlisted == True,
        )
        .order_by(Participant.created_at.asc())
        .all()
    )

    for p in waitlisted:
        if available_spots <= 0:
            break
        p.is_waitlisted = False
        available_spots -= 1