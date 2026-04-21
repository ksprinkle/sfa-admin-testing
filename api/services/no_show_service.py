from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models.events import Event
from models.participants import Participant
from models.sessions import Session as EventSession


def get_no_show_candidates(db: Session, event_id):
    """
    Returns a list of participants who are registered for the event,
    assigned to a session, not checked in, and the session has started
    at least no_show_minutes ago (per event config).
    """
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event or not event.no_show_minutes:
        return []

    # Only show no-shows if there are waitlisted participants
    waitlisted_count = db.query(Participant).filter(
        Participant.event_id == event_id,
        Participant.is_waitlisted == True
    ).count()
    if waitlisted_count == 0:
        return []

    now = datetime.utcnow()
    candidates = (
        db.query(Participant)
        .join(EventSession, Participant.session_id == EventSession.id)
        .filter(
            Participant.event_id == event_id,
            Participant.checked_in == False,
            Participant.is_waitlisted == False,
            EventSession.start_time != None,
            EventSession.start_time + timedelta(minutes=event.no_show_minutes) <= now,
        )
        .all()
    )
    # Only count as no-show if their session is full
    session_ids = [p.session_id for p in candidates]
    session_counts = {
        s.id: db.query(Participant).filter(
            Participant.session_id == s.id,
            Participant.is_waitlisted == False
        ).count()
        for s in db.query(EventSession).filter(EventSession.id.in_(session_ids)).all()
    }
    full_sessions = {s.id for s in db.query(EventSession).filter(EventSession.id.in_(session_ids), EventSession.capacity != None).all() if session_counts.get(s.id, 0) >= s.capacity}
    filtered = [p for p in candidates if p.session_id in full_sessions]
    return filtered


def promote_no_show_slots(db: Session, event_id):
    """
    Promote waitlisted participants for all no-show slots in the event.
    Returns a list of promoted participants.
    """
    no_shows = get_no_show_candidates(db, event_id)
    event = db.query(Event).filter(Event.id == event_id).first()
    promoted = []
    for ns in no_shows:
        from crud.participants import promote_from_waitlist
        # Remove the no-show participant (admin action required)
        db.delete(ns)
        db.commit()
        # Promote from waitlist
        p = promote_from_waitlist(db, event)
        if p:
            promoted.append(p)
    return promoted
