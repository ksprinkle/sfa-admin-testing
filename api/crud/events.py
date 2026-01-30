from sqlalchemy.orm import Session
from datetime import date
from api.models.events import Event

from sqlalchemy.orm import Session
from datetime import date
from api.models.events import Event

from api.schemas.events import EventCreate


def create_event(db: Session, event_in: EventCreate):
    event = Event(
        **event_in.dict(),
        participant_count=0,
        volunteer_count=0,
    )

    db.add(event)
    db.commit()
    db.refresh(event)
    return event


from sqlalchemy.orm import Session
from datetime import date
from api.models.events import Event
from api.schemas.events import EventUpdate


def update_event(db: Session, event: Event, event_in: EventUpdate):
    update_data = event_in.dict(exclude_unset=True)

    for field, value in update_data.items():
        setattr(event, field, value)

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
):
    query = db.query(Event)

    if not is_admin:
        query = query.filter(Event.status == "published")

    if state:
        query = query.filter(Event.state == state)

    if event_type:
        query = query.filter(Event.event_type == event_type)

    if start_date:
        query = query.filter(Event.start_date >= start_date)

    if end_date:
        query = query.filter(Event.start_date <= end_date)

    return query.order_by(Event.start_date.asc()).all()

def get_event_by_slug(db: Session, slug: str, is_admin: bool = False):
    query = db.query(Event).filter(Event.slug == slug)

    if not is_admin:
        query = query.filter(Event.status == "published")

    return query.first()
