from datetime import datetime, timedelta
from uuid import uuid4

from .db.session import SessionLocal
from .models.events import Event
from .models.sessions import Session as EventSession

db = SessionLocal()

events = db.query(Event).all()

for event in events:
    if event.sessions:
        continue

    base_time = datetime.combine(event.start_date, event.start_time)

    if not base_time:
        continue

    # Session 1
    session1 = EventSession(
        id=uuid4(),
        event_id=event.id,
        name="Session 1",
        start_time=base_time,
        end_time=(base_time + timedelta(hours=1)),
        capacity=15,
    )

    # Session 2
    session2 = EventSession(
        id=uuid4(),
        event_id=event.id,
        name="Session 2",
        start_time=(base_time + timedelta(hours=1)),
        end_time=(base_time + timedelta(hours=2)),
        capacity=15,
    )

    db.add(session1)
    db.add(session2)

db.commit()
db.close()

print("✅ Sessions created")