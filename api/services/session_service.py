from api.models.sessions import Session
from api.models.participants import Participant
from sqlalchemy import func

def get_next_available_session(db, event_id: str):
    sessions = (
        db.query(Session)
        .filter(Session.event_id == event_id)
        .order_by(Session.start_time.asc())
        .all()
    )

    for session in sessions:
        count = (
            db.query(Participant)
            .filter(
                Participant.session_id == session.id,
                Participant.removed_at.is_(None),
                func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
            )
            .count()
        )

        if count < session.capacity:
            return session

    return None