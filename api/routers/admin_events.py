
from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID
from sqlalchemy.orm import Session
from typing import List
from api.crud.participants import promote_from_waitlist
from api.db.session import get_db
from api.dependencies import require_admin
from api.models.events import Event
from api.schemas.events import AdminEventListOut, EventOut, EventUpdate, EventCreate
from api.crud.events import create_event as crud_create_event, update_event as crud_update_event
from sqlalchemy.orm import joinedload
from api.schemas.participants import AdminParticipantListOut, ParticipantOut
from api.utils.event_builder import build_admin_event
from api.models.participants import Participant
from api.schemas.events import AdminEventSummary
from datetime import datetime
from api.services.no_show_service import get_no_show_candidates, promote_no_show_slots

router = APIRouter(
    prefix="/admin/events",
    tags=["Admin Events"],
)


# --- No-show endpoints must be after router is defined ---
from typing import List as TypingList
# 🔹 Get no-show candidates for an event
@router.get("/{event_id}/no_shows", response_model=TypingList[str])
def get_no_shows(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    candidates = get_no_show_candidates(db, event_id)
    return [str(p.id) for p in candidates] if candidates else []

# 🔹 Manually promote waitlisted participants for no-show slots
@router.post("/{event_id}/promote_no_shows", response_model=TypingList[str])
def promote_no_shows(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    promoted = promote_no_show_slots(db, event_id)
    return [str(p.id) for p in promoted] if promoted else []

#🔹 Create new event
@router.post("/", response_model=EventOut, status_code=201)
def create_event(
    event_in: EventCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = crud_create_event(db, event_in)

    return build_admin_event(event)

#🔹 Get event details (admin view)
@router.get("/{event_id}", response_model=AdminEventListOut)
def get_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participant_count = len(
        [p for p in event.participants if not p.is_waitlisted]
    )

    waitlist_count = len(
        [p for p in event.participants if p.is_waitlisted]
    )

    checked_in_count = len(
        [p for p in event.participants if p.checked_in]
    )

    return build_admin_event(event)

# 🔹 Get event summary
@router.get("/{event_id}/summary", response_model=AdminEventSummary)
def event_summary(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    from sqlalchemy.orm import joinedload

    event = (
        db.query(Event)
        .options(joinedload(Event.participants))
        .filter(Event.id == event_id)
        .first()
    )

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = event.participants

    surfers = 0
    waitlisted = 0
    checked_in = 0
    volunteers = 0
    waivers_missing = 0

    for p in participants:
        # Treat any checked-in participant as confirmed (not waitlisted)
        if p.checked_in:
            surfers += 1
            checked_in += 1
        elif p.is_waitlisted:
            waitlisted += 1
        else:
            surfers += 1

        if not p.waiver_verified:
            waivers_missing += 1

    participant_remaining = None
    participant_fill_percent = None
    volunteer_remaining = None
    volunteer_fill_percent = None

    if event.participant_capacity:
        participant_remaining = max(
            event.participant_capacity - surfers, 0
        )

        participant_fill_percent = round(
            (surfers / event.participant_capacity) * 100, 2
        )

    return {
        "event_id": event.id,
        "title": event.title,
        "status": event.status,

        "participant_count": surfers,
        "waitlist_count": waitlisted,
        "checked_in_count": checked_in,
        "waivers_missing": waivers_missing,

        "participant_capacity": event.participant_capacity,
        "participant_remaining": participant_remaining,
        "participant_fill_percent": participant_fill_percent,

        "volunteer_count": volunteers,
        "volunteer_capacity": event.volunteer_capacity,
        "volunteer_remaining": volunteer_remaining,
        "volunteer_fill_percent": volunteer_fill_percent,
}

# 🔹 List all events (admin view)
@router.get("/", response_model=List[AdminEventListOut])
def list_all_events(
    skip: int = 0,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    query = db.query(Event).options(joinedload(Event.participants))

    if status:
        query = query.filter(Event.status == status)

    events = query.order_by(Event.start_date.asc()).all()

    return [build_admin_event(e) for e in events]


# 🔹 Update event
@router.put("/{event_id}", response_model=AdminEventListOut)
def update_event(
    event_id: UUID,
    update_data: EventUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = (
    db.query(Event)
    .options(joinedload(Event.participants))
    .filter(Event.id == event_id)
    .first()
)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event = crud_update_event(db, event, update_data)
    
    return build_admin_event(event)

# 🔹 Delete event
@router.delete("/{event_id}")
def delete_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(event)
    db.commit()

    return {"message": "Event deleted"}

# 🔹 List participants for an event (admin view)
@router.get("/{event_id}/participants",)
def list_event_participants(
    event_id: UUID,
    checked_in: bool | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    query = db.query(Participant).filter(
        Participant.event_id == event_id
    )

    if checked_in is not None:
        query = query.filter(Participant.checked_in == checked_in)

    return query.all()

@router.get("/participants", response_model=List[AdminParticipantListOut])
def list_all_participants(
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    return db.query(Participant).all()


