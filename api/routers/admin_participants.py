from api.models.participants import Participant
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.exc import IntegrityError
from api.crud.participants import promote_from_waitlist, promote_specific_waitlisted_participant
from api.db.session import get_db
from api.dependencies import require_admin
from api.models.events import Event
from sqlalchemy.orm import joinedload
from datetime import datetime, timedelta
from api.schemas.participants import ParticipantAction, ParticipantCreate, ParticipantOut, ParticipantUpdate, SessionUpdate
from api.ws_manager import manager
import json
from sqlalchemy import func
from api.models.sessions import Session as EventSession
from api.services.session_service import get_next_available_session


def _is_volunteer_role(value: str | None) -> bool:
    return (value or "").strip().lower() == "volunteer"

router = APIRouter(
    prefix="/admin/participants",
    tags=["Admin Participants"],
)


@router.patch("/{participant_id}", response_model=ParticipantOut)
async def update_participant(
    participant_id: UUID,
    payload: ParticipantUpdate,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    participant = db.query(Participant).filter(Participant.id == participant_id).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(status_code=400, detail="No update fields provided")

    effective_role = updates.get("role", participant.role)

    session_id_in_payload = "session_id" in updates
    target_session_id = updates.pop("session_id", None)

    if session_id_in_payload:
        if target_session_id is None:
            participant.session_id = None
        else:
            session = db.query(EventSession).filter(EventSession.id == target_session_id).first()
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

            if str(session.event_id) != str(participant.event_id):
                raise HTTPException(status_code=400, detail="Session does not belong to participant event")

            if not _is_volunteer_role(effective_role):
                count = db.query(Participant).filter(
                    Participant.session_id == target_session_id,
                    Participant.id != participant.id,
                    func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
                ).count()

                if count >= 15:
                    raise HTTPException(status_code=400, detail="Session is full")

            participant.session_id = target_session_id
            participant.is_waitlisted = False

    if "priority" in updates and updates["priority"] is not None:
        updates["priority"] = max(0, min(3, updates["priority"]))

    if "is_waitlisted" in updates:
        if updates["is_waitlisted"]:
            participant.is_waitlisted = True
            participant.session_id = None
        else:
            participant.is_waitlisted = False

    for field in [
        "first_name",
        "last_name",
        "email",
        "role",
        "is_minor",
        "priority",
        "waiver_signed",
        "waiver_verified",
        "notes",
    ]:
        if field in updates:
            setattr(participant, field, updates[field])

    if _is_volunteer_role(participant.role):
        participant.is_waitlisted = False

    if "checked_in" in updates:
        if updates["checked_in"]:
            effective_waiver_verified = updates.get("waiver_verified", participant.waiver_verified)
            if not effective_waiver_verified:
                raise HTTPException(status_code=400, detail="Waiver not verified")

            participant.checked_in = True
            if not participant.checked_in_at:
                participant.checked_in_at = datetime.utcnow()
        else:
            participant.checked_in = False
            participant.checked_in_at = None

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="A participant with this email already exists for this event",
        )

    db.refresh(participant)

    await manager.broadcast(json.dumps({
        "type": "participant_update",
        "participant_id": str(participant.id),
        "action": "update_participant",
        "email": participant.email,
    }))

    return participant

# @router.get("/test")
# def test():
#     print("🔥 ADMIN PARTICIPANTS HIT")
#     return {"ok": True}

@router.post("/", response_model=ParticipantOut)
def create_participant(
    data: ParticipantCreate,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    
    event = db.query(Event).filter(Event.id == data.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Auto-assign session based on capacity.
    # Order by session start time, not by UUID, to assign the earliest available session.
    sessions = db.query(EventSession)\
        .filter(EventSession.event_id == data.event_id)\
        .order_by(EventSession.start_time.asc(), EventSession.id.asc())\
        .all()

    if not sessions:
        if not event.start_date or not event.start_time:
            raise HTTPException(status_code=400, detail="No sessions configured for this event")

        base_time = datetime.combine(event.start_date, event.start_time)

        session1 = EventSession(
            event_id=event.id,
            name="Session 1",
            start_time=base_time,
            end_time=base_time + timedelta(hours=1),
            capacity=15,
        )

        session2 = EventSession(
            event_id=event.id,
            name="Session 2",
            start_time=base_time + timedelta(hours=1),
            end_time=base_time + timedelta(hours=2),
            capacity=15,
        )

        db.add_all([session1, session2])
        db.flush()

        sessions = [session1, session2]

    is_volunteer = _is_volunteer_role(data.role)

    # Use centralized session assignment for participant roles.
    if is_volunteer:
        assigned_session_id = sessions[0].id if sessions else None
        is_waitlisted = False
    else:
        available_session = get_next_available_session(db, data.event_id)
        assigned_session_id = available_session.id if available_session else None
        # If no session available, add as waitlisted (don't turn away extras)
        is_waitlisted = not assigned_session_id

    try:
        participant = Participant(
            event_id=data.event_id,
            session_id=assigned_session_id,
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            role=data.role,
            is_minor=data.is_minor,
            is_waitlisted=is_waitlisted,
        )

        db.add(participant)

        # Final capacity check to prevent exceeding session capacity under race conditions
        if participant.session_id and not is_volunteer:
            final_count = db.query(func.count(Participant.id)).filter(
                Participant.session_id == participant.session_id,
                func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
            ).scalar()
            if final_count > 15:
                participant.is_waitlisted = True
                participant.session_id = None

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
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
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
        participant.session_id = None
        db.commit()
        promote_from_waitlist(db, participant.event, exclude_participant_id=participant.id)
        # Broadcast update
        import asyncio
        asyncio.create_task(manager.broadcast(json.dumps({
            "type": "participant_update",
            "participant_id": str(participant.id),
            "action": "move_to_waitlist"
        })))
        return {"message": "Participant moved to waitlist"}

    elif action.action == "promote":
        participant.is_waitlisted = False

    elif action.action == "remove":
        db.delete(participant)
        db.commit()
        # Broadcast update
        import asyncio
        asyncio.create_task(manager.broadcast(json.dumps({
            "type": "participant_update",
            "participant_id": str(participant_id),
            "action": "remove"
        })))
        return {"message": "Participant removed"}

    db.commit()
    db.refresh(participant)

    # Broadcast update
    import asyncio
    asyncio.create_task(manager.broadcast(json.dumps({
        "type": "participant_update",
        "participant_id": str(participant.id),
        "action": action.action
    })))

    return {"message": f"{action.action} successful"}

#  Promote from Waitlist
@router.patch("/{participant_id}/promote")
def promote_participant(
    participant_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):

    participant = (
        db.query(Participant)
        .filter(Participant.id == participant_id)
        .first()
    )

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    if not participant.is_waitlisted:
        return {"message": "Participant is already active"}

    event = participant.event
    is_volunteer = _is_volunteer_role(participant.role)

    if event.participant_capacity is not None and not is_volunteer:
        confirmed_count = db.query(Participant).filter(
            Participant.event_id == event.id,
            Participant.is_waitlisted == False,
            func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
        ).count()

        if confirmed_count >= event.participant_capacity:
            raise HTTPException(
                status_code=400,
                detail="Event is already at participant capacity"
            )

    promote_specific_waitlisted_participant(db, participant)

    return {"message": "Participant promoted from waitlist"}
   
# 🔹 Delete Participant
@router.delete("/{participant_id}")
def remove_participant(
    participant_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
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
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
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
            "priority": p.priority,
        }
        for p in participants
    ]

#🔹 List participants for an event (admin view)
@router.patch("/{participant_id}/checkin")
async def check_in_participant(
    participant_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
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

    # Broadcast update so all open clients refresh without manual reload.
    await manager.broadcast(json.dumps({
        "type": "participant_update",
        "participant_id": str(participant.id),
        "action": "checkin",
        "checked_in": True
    }))

    return {
        "message": "Participant checked in",
        "checked_in_at": participant.checked_in_at
    }
#🔹 Update participant session assignment    

@router.patch("/{participant_id}/session")
async def update_participant_session(
    participant_id: UUID,
    payload: SessionUpdate,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
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

    # Manual admin placement overrides the waitlist queue temporarily.
    # Keep the participant's existing priority, but remove them from the waitlist.
    participant.session_id = session.id
    participant.is_waitlisted = False
    db.commit()

    # Broadcast update
    await manager.broadcast(json.dumps({
        "type": "participant_update",
        "participant_id": str(participant.id),
        "action": "update_session",
        "session_id": str(session.id)
    }))

    return {"success": True}

#🔹 Update participant priority

@router.patch("/{participant_id}/priority")
async def update_participant_priority(
    participant_id: UUID,
    priority: int,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    participant = db.query(Participant).filter(Participant.id == participant_id).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Clamp priority between 1 and 3 (0 = unset)
    clamped = max(0, min(3, priority))
    participant.priority = clamped
    db.commit()

    # Broadcast update
    await manager.broadcast(json.dumps({
        "type": "participant_update",
        "participant_id": str(participant.id),
        "action": "update_priority",
        "priority": clamped
    }))

    return {"success": True}
