from api.db.session import SessionLocal
from api.models.events import Event
from api.models.participants import Participant
from api.models.sessions import Session as EventSession

db = SessionLocal()

events = db.query(Event).all()

for event in events:
    sessions = (
        db.query(EventSession)
        .filter(EventSession.event_id == event.id)
        .order_by(EventSession.start_time.asc())
        .all()
    )

    if len(sessions) < 2:
        continue

    session1, session2 = sessions[0], sessions[1]

    participants = (
    db.query(Participant)
    .filter(Participant.event_id == event.id)
    .order_by(Participant.created_at.asc())
    .all()
)

    count_s1 = 0
    count_s2 = 0

    print("Participants found:", len(participants))
    print("Sessions found:", len(sessions))

MAX_PER_SESSION = 15

for event in events:
    sessions = (
        db.query(EventSession)
        .filter(EventSession.event_id == event.id)
        .order_by(EventSession.start_time.asc())
        .all()
    )

    if len(sessions) < 2:
        continue

    session1, session2 = sessions[0], sessions[1]

    participants = (
        db.query(Participant)
        .filter(Participant.event_id == event.id)
        .order_by(Participant.created_at.asc())
        .all()
    )

    count_s1 = 0
    count_s2 = 0

    for p in participants:
        if count_s1 < MAX_PER_SESSION:
            p.session_id = session1.id
            count_s1 += 1
        elif count_s2 < MAX_PER_SESSION:
            p.session_id = session2.id
            count_s2 += 1

db.commit()
db.close()

print("✅ Participants assigned to sessions")