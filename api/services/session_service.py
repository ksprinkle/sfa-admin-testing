from datetime import datetime, timedelta

from sqlalchemy import func

from models.events import Event
from models.participants import Participant
from models.sessions import Session

DEFAULT_SESSION_CAPACITY = 15
TOUR_SESSION_MINUTES = 20
CHAPTER_SESSION_MINUTES = 60


def is_tour_event(event_type: str | None) -> bool:
    return (event_type or "").strip().lower() == "tour"


def session_duration_minutes_for_event(event_type: str | None) -> int:
    return TOUR_SESSION_MINUTES if is_tour_event(event_type) else CHAPTER_SESSION_MINUTES


def get_session_participant_count(db, session_id):
    return (
        db.query(Participant)
        .filter(
            Participant.session_id == session_id,
            Participant.removed_at.is_(None),
            func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
        )
        .count()
    )


def _build_next_session_name(sessions: list[Session]) -> str:
    return f"Session {len(sessions) + 1}"


def create_next_tour_session(db, event: Event, existing_sessions: list[Session] | None = None):
    if not event.start_date or not event.start_time:
        return None

    sessions = existing_sessions
    if sessions is None:
        sessions = (
            db.query(Session)
            .filter(Session.event_id == event.id)
            .order_by(Session.start_time.asc(), Session.id.asc())
            .all()
        )

    base_time = datetime.combine(event.start_date, event.start_time)
    minutes = session_duration_minutes_for_event(event.event_type)

    if not sessions:
        start_time = base_time
    else:
        last_session = sessions[-1]
        start_time = last_session.end_time or (base_time + timedelta(minutes=minutes * len(sessions)))

    end_time = start_time + timedelta(minutes=minutes)

    new_session = Session(
        event_id=event.id,
        name=_build_next_session_name(sessions),
        start_time=start_time,
        end_time=end_time,
        capacity=DEFAULT_SESSION_CAPACITY,
    )
    db.add(new_session)
    db.flush()

    return new_session


def get_next_available_session(db, event_id: str):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        return None

    sessions = (
        db.query(Session)
        .filter(Session.event_id == event_id)
        .order_by(Session.start_time.asc(), Session.id.asc())
        .all()
    )

    for session in sessions:
        count = get_session_participant_count(db, session.id)

        if count < (session.capacity or DEFAULT_SESSION_CAPACITY):
            return session

    # Tour events can grow session count as needed.
    if is_tour_event(event.event_type):
        return create_next_tour_session(db, event, sessions)

    return None