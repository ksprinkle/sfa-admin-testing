from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models.events import Event
from models.participants import Participant
from models.sessions import Session as EventSession
from models.participant_removal_log import ParticipantRemovalLog


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
        Participant.removed_at.is_(None),
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
            Participant.removed_at.is_(None),
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
            Participant.removed_at.is_(None),
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
        stage = "post_checkin" if ns.checked_in else ("waitlist" if ns.is_waitlisted else ("waiver_verified" if ns.waiver_verified else "registered"))
        timestamp = datetime.utcnow()
        ns.removed_at = timestamp
        ns.removed_reason_code = "no_show"
        ns.removed_reason_note = "Auto-removed by no-show promotion"
        ns.removed_by_user_id = None
        ns.removed_stage = stage

        db.add(
            ParticipantRemovalLog(
                participant_id=str(ns.id),
                event_id=str(ns.event_id),
                first_name=ns.first_name,
                last_name=ns.last_name,
                email=ns.email,
                role=ns.role,
                was_waitlisted="true" if ns.is_waitlisted else "false",
                was_checked_in="true" if ns.checked_in else "false",
                was_waiver_verified="true" if ns.waiver_verified else "false",
                removed_reason_code="no_show",
                removed_reason_note="Auto-removed by no-show promotion",
                removed_stage=stage,
                removed_by_user_id=None,
                removed_by_user_email="system",
            )
        )
        db.commit()
        # Promote from waitlist
        p = promote_from_waitlist(db, event)
        if p:
            promoted.append(p)
    return promoted
