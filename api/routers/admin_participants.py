from api.models.participants import Participant
from api.schemas.participants import AdminParticipantListOut, ParticipantOut
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from api.crud.participants import promote_from_waitlist
from api.db.session import get_db
from api.dependencies import require_admin
from api.models import events
from api.models.events import Event
from sqlalchemy.orm import joinedload
from api.models.participants import Participant
from datetime import datetime
from api.schemas.participants import ParticipantAction
from sqlalchemy import func

router = APIRouter(
    prefix="/admin/participants",
    tags=["Admin Participants"],
)

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

@router.get("/", response_model=List[AdminParticipantListOut])
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
            "event_title": p.event.title if p.event else None,
        }
        for p in participants
    ]

@router.get("/event/{event_id}", response_model=List[ParticipantOut])
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
