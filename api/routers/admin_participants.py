from models.participants import Participant
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from crud.participants import promote_from_waitlist
from db.session import get_db
from dependencies import require_admin
from models import events
from models.events import Event
from sqlalchemy.orm import joinedload
from datetime import datetime
from schemas.participants import ParticipantAction
from sqlalchemy import func
from schemas.participants import ParticipantCreate, ParticipantOut
from fastapi import Query
from models.sessions import Session as EventSession
from schemas.participants import SessionUpdate

router = APIRouter(
    prefix="/participants",
    tags=["Admin Participants"],
)

#@router.get("/test")
#def test():
#    print("🔥 ADMIN PARTICIPANTS HIT")
#    return {"ok": True}

from fastapi import HTTPException

@router.post("/", response_model=ParticipantOut)
def create_participant(
    data: ParticipantCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    try:
        participant = Participant(
            event_id=data.event_id,
            session_id=None,
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            role=data.role,
            is_minor=data.is_minor,
        )

        db.add(participant)
        db.commit()
        db.refresh(participant)
        return participant

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

#🔹 Participant actions (check-in, verify waiver, move to waitlist, promote, remove)
@router.post("/{participant_id}/action")
def participant_action(
    participant_id: UUID,
    action: ParticipantAction,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    participant = db.query(Participant).filter(
        Participant.id == participant_id
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    if action.action == "checkin":

        if not participant.waiver_verified:
            raise HTTPException(
                status_code=400,
                detail="Waiver not verified"
            )

        participant.checked_in = True
        participant.checked_in_at = datetime.utcnow()

    elif action.action == "undo_checkin":

        participant.checked_in = False
        participant.checked_in_at = None

    elif action.action == "verify_waiver":

        participant.waiver_verified = True

    elif action.action == "move_to_waitlist":

        participant.is_waitlisted = True

    elif action.action == "promote":

        participant.is_waitlisted = False

    elif action.action == "remove":

        db.delete(participant)
        db.commit()
        return {"message": "Participant removed"}

    db.commit()
    db.refresh(participant)

    return {"message": f"{action.action} successful"}

#  Promote from Waitlist
@router.patch("/{participant_id}/promote")
def promote_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):

    participant = (
        db.query(Participant)
        .filter(Participant.id == participant_id)
        .first()
    )

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    event = participant.event

    if event.participant_capacity is not None:
        confirmed_count = event.surfer_count

        if confirmed_count >= event.participant_capacity:
            raise HTTPException(
                status_code=400,
                detail="Event is already at participant capacity"
            )

    participant.is_waitlisted = False

    db.commit()
    db.refresh(participant)

    return {"message": "Participant promoted from waitlist"}
   
# 🔹 Delete Participant
@router.delete("/{participant_id}")
def remove_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):

    participant = (
        db.query(Participant)
        .filter(Participant.id == participant_id)
        .first()
    )

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    event = participant.event
    was_waitlisted = participant.is_waitlisted

    db.delete(participant)
    db.commit()

    if not was_waitlisted:
        promote_from_waitlist(db, event)

    return {"message": "Participant removed"}

#🔹 List all participants with optional search
@router.get("/",)
def list_all_participants(
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):

    query = db.query(Participant).options(joinedload(Participant.event))

    if search:
        search = f"%{search.lower()}%"
        query = query.filter(
            func.lower(Participant.first_name).like(search) |
            func.lower(Participant.last_name).like(search) |
            func.lower(Participant.email).like(search)
        )

    participants = query.all()

    return [
        {
            "id": p.id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "email": p.email,
            "checked_in": p.checked_in,
            "is_waitlisted": p.is_waitlisted,
            "waiver_verified": p.waiver_verified,
            "event_title": p.event.title if p.event else None,
        }
        for p in participants
    ]

#🔹 List participants for an event (admin view)
@router.patch("/{participant_id}/checkin")
def check_in_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    participant = (
    db.query(Participant)
    .filter(Participant.id == participant_id)
    .first()
)

    if not participant.waiver_verified:
        raise HTTPException(
            status_code=400,
            detail="Waiver not verified"
        )
    participant.checked_in = True
    participant.checked_in_at = datetime.utcnow()

    db.commit()
    db.refresh(participant)

    return {
        "message": "Participant checked in",
        "checked_in_at": participant.checked_in_at
    }
#🔹 Update participant session assignment    
from pydantic import BaseModel
from fastapi import Body
from uuid import UUID

class SessionUpdate(BaseModel):
    session_id: UUID

@router.patch("/{participant_id}/session")
def update_participant_session(
    participant_id: UUID,
    payload: SessionUpdate,
    db: Session = Depends(get_db)
):
    session = db.query(EventSession).filter(EventSession.id == payload.session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    participant = db.query(Participant).filter(Participant.id == participant_id).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Already in session → no-op
    if participant.session_id == payload.session_id:
        return {"success": True}

    count = db.query(Participant).filter(
        Participant.session_id == payload.session_id
    ).count()

    if count >= 15:
        raise HTTPException(status_code=400, detail="Session is full")

    participant.session_id = session.id
    db.commit()

    return {"success": True}
