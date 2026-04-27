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
from datetime import date, datetime, timedelta
from api.schemas.participants import AdminParticipantListOut, ParticipantAction, ParticipantCreate, ParticipantOut, ParticipantUpdate, SessionUpdate, ParticipantRemovalLogOut
from api.ws_manager import manager
import json
from sqlalchemy import func, false
import logging
import csv
import io
from fastapi.responses import StreamingResponse
from api.models.sessions import Session as EventSession
from api.services.session_service import (
    CHAPTER_SESSION_MINUTES,
    DEFAULT_SESSION_CAPACITY,
    create_next_tour_session,
    get_next_available_session,
    get_session_participant_count,
    is_tour_event,
)
from api.models.participant_removal_log import ParticipantRemovalLog


def _is_volunteer_role(value: str | None) -> bool:
    return (value or "").strip().lower() == "volunteer"

router = APIRouter(
    prefix="/admin/participants",
    tags=["Admin Participants"],
)

logger = logging.getLogger(__name__)


def _base_active_participant_query(db: DBSession):
    return db.query(Participant).filter(Participant.removed_at.is_(None))


def _get_removal_stage(participant: Participant) -> str:
    if participant.checked_in:
        return "post_checkin"
    if participant.is_waitlisted:
        return "waitlist"
    if participant.waiver_verified:
        return "waiver_verified"
    return "registered"


def _soft_remove_participant(
    db: DBSession,
    participant: Participant,
    *,
    reason_code: str,
    reason_note: str | None,
    removed_by_user_id: str | None,
    removed_by_user_email: str | None,
):
    stage = _get_removal_stage(participant)
    timestamp = datetime.utcnow()

    participant.removed_at = timestamp
    participant.removed_reason_code = reason_code
    participant.removed_reason_note = (reason_note or "").strip() or None
    participant.removed_by_user_id = removed_by_user_id
    participant.removed_stage = stage

    db.add(
        ParticipantRemovalLog(
            participant_id=str(participant.id),
            event_id=str(participant.event_id),
            first_name=participant.first_name,
            last_name=participant.last_name,
            email=participant.email,
            role=participant.role,
            was_waitlisted="true" if participant.is_waitlisted else "false",
            was_checked_in="true" if participant.checked_in else "false",
            was_waiver_verified="true" if participant.waiver_verified else "false",
            removed_reason_code=reason_code,
            removed_reason_note=(reason_note or "").strip() or None,
            removed_stage=stage,
            removed_by_user_id=removed_by_user_id,
            removed_by_user_email=removed_by_user_email,
        )
    )


def _parse_date_filter(value: str | None, field_name: str) -> date | None:
    if not value:
        return None

    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}; use YYYY-MM-DD") from exc


def _build_removal_log_query(
    db: DBSession,
    *,
    email: str | None,
    reason_code: str | None,
    event_id: str | None,
    event_type: str | None,
    date_from: str | None,
    date_to: str | None,
):
    query = db.query(ParticipantRemovalLog)

    if email:
        like_email = f"%{email.strip().lower()}%"
        query = query.filter(func.lower(ParticipantRemovalLog.email).like(like_email))

    if reason_code:
        query = query.filter(ParticipantRemovalLog.removed_reason_code == reason_code.strip().lower())

    if event_id:
        query = query.filter(ParticipantRemovalLog.event_id == event_id.strip())

    if event_type:
        normalized_event_type = event_type.strip().lower()
        matching_event_id_rows = (
            db.query(Event.id)
            .filter(func.lower(func.coalesce(Event.event_type, "")) == normalized_event_type)
            .all()
        )
        matching_event_ids = [str(row.id) for row in matching_event_id_rows]
        if not matching_event_ids:
            return query.filter(false())
        query = query.filter(ParticipantRemovalLog.event_id.in_(matching_event_ids))

    parsed_from = _parse_date_filter(date_from, "date_from")
    parsed_to = _parse_date_filter(date_to, "date_to")

    if parsed_from:
        query = query.filter(func.date(ParticipantRemovalLog.created_at) >= parsed_from.isoformat())
    if parsed_to:
        query = query.filter(func.date(ParticipantRemovalLog.created_at) <= parsed_to.isoformat())

    return query


def _build_event_lookup(db: DBSession, event_ids: set[str]) -> dict[str, dict[str, str | None]]:
    if not event_ids:
        return {}

    # Removal logs persist event_id as text while Event.id is UUID in the ORM.
    # Convert to UUID objects before filtering to avoid UUID processor errors.
    parsed_event_ids: list[UUID] = []
    for event_id in event_ids:
        try:
            parsed_event_ids.append(UUID(str(event_id)))
        except (ValueError, TypeError):
            continue

    if not parsed_event_ids:
        return {}

    events = db.query(Event.id, Event.title, Event.event_type).filter(Event.id.in_(parsed_event_ids)).all()
    return {
        str(event.id): {
            "title": event.title,
            "event_type": event.event_type,
        }
        for event in events
    }


@router.patch("/{participant_id}", response_model=ParticipantOut)
async def update_participant(
    participant_id: UUID,
    payload: ParticipantUpdate,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    participant = _base_active_participant_query(db).filter(Participant.id == participant_id).first()

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
                    Participant.removed_at.is_(None),
                    Participant.id != participant.id,
                    func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
                ).count()

                session_capacity = session.capacity or DEFAULT_SESSION_CAPACITY
                if count >= session_capacity:
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
        "volunteer_type",
        "volunteer_additional_types",
        "volunteer_is_versatile",
    ]:
        if field in updates:
            setattr(participant, field, updates[field])

    if _is_volunteer_role(participant.role):
        participant.is_waitlisted = False
    else:
        participant.volunteer_type = None
        participant.volunteer_additional_types = []
        participant.volunteer_is_versatile = False

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

        if is_tour_event(event.event_type):
            first_tour_session = create_next_tour_session(db, event, existing_sessions=[])
            sessions = [first_tour_session] if first_tour_session else []
        else:
            base_time = datetime.combine(event.start_date, event.start_time)

            session1 = EventSession(
                event_id=event.id,
                name="Session 1",
                start_time=base_time,
                end_time=base_time + timedelta(minutes=CHAPTER_SESSION_MINUTES),
                capacity=DEFAULT_SESSION_CAPACITY,
            )

            session2 = EventSession(
                event_id=event.id,
                name="Session 2",
                start_time=base_time + timedelta(minutes=CHAPTER_SESSION_MINUTES),
                end_time=base_time + timedelta(minutes=CHAPTER_SESSION_MINUTES * 2),
                capacity=DEFAULT_SESSION_CAPACITY,
            )

            db.add_all([session1, session2])
            db.flush()

            sessions = [session1, session2]

    is_volunteer = _is_volunteer_role(data.role)
    volunteer_type = data.volunteer_type if is_volunteer else None
    volunteer_additional_types = data.volunteer_additional_types if is_volunteer else []
    volunteer_is_versatile = data.volunteer_is_versatile if is_volunteer else False

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
            volunteer_type=volunteer_type,
            volunteer_additional_types=volunteer_additional_types,
            volunteer_is_versatile=volunteer_is_versatile,
        )

        db.add(participant)

        # Final capacity check to prevent exceeding session capacity under race conditions
        if participant.session_id and not is_volunteer:
            session_capacity = next((s.capacity for s in sessions if s.id == participant.session_id), None) or DEFAULT_SESSION_CAPACITY
            final_count = get_session_participant_count(db, participant.session_id)
            if final_count > session_capacity:
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
    participant = _base_active_participant_query(db).filter(
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
        # Broadcast update from sync route context; never fail request if push fails.
        import asyncio
        try:
            asyncio.run(manager.broadcast(json.dumps({
                "type": "participant_update",
                "participant_id": str(participant.id),
                "action": "move_to_waitlist"
            })))
        except Exception as exc:
            logger.warning("participant_update broadcast failed after move_to_waitlist: %s", exc)
        return {"message": "Participant moved to waitlist"}

    elif action.action == "promote":
        participant.is_waitlisted = False

    elif action.action == "remove":
        reason_code = action.removal_reason_code or "admin_correction"
        was_waitlisted = bool(participant.is_waitlisted)
        event = participant.event
        _soft_remove_participant(
            db,
            participant,
            reason_code=reason_code,
            reason_note=action.removal_reason_note,
            removed_by_user_id=str(getattr(_current_user, "id", "") or ""),
            removed_by_user_email=getattr(_current_user, "email", None),
        )
        db.commit()

        # If a confirmed participant was removed, immediately fill the freed spot.
        if not was_waitlisted:
            promote_from_waitlist(db, event)

        # Broadcast update from sync route context; never fail request if push fails.
        import asyncio
        try:
            asyncio.run(manager.broadcast(json.dumps({
                "type": "participant_update",
                "participant_id": str(participant_id),
                "action": "remove"
            })))
        except Exception as exc:
            logger.warning("participant_update broadcast failed after remove: %s", exc)
        return {"message": "Participant removed"}

    db.commit()
    db.refresh(participant)

    # Broadcast update from sync route context; never fail request if push fails.
    import asyncio
    try:
        asyncio.run(manager.broadcast(json.dumps({
            "type": "participant_update",
            "participant_id": str(participant.id),
            "action": action.action
        })))
    except Exception as exc:
        logger.warning("participant_update broadcast failed after action '%s': %s", action.action, exc)

    return {"message": f"{action.action} successful"}

#  Promote from Waitlist
@router.patch("/{participant_id}/promote")
def promote_participant(
    participant_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):

    participant = (
        _base_active_participant_query(db)
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
            Participant.removed_at.is_(None),
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
        _base_active_participant_query(db)
        .filter(Participant.id == participant_id)
        .first()
    )

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    event = participant.event
    was_waitlisted = participant.is_waitlisted

    _soft_remove_participant(
        db,
        participant,
        reason_code="admin_correction",
        reason_note="Removed through legacy delete endpoint",
        removed_by_user_id=str(getattr(_current_user, "id", "") or ""),
        removed_by_user_email=getattr(_current_user, "email", None),
    )
    db.commit()

    if not was_waitlisted:
        promote_from_waitlist(db, event)

    return {"message": "Participant removed"}

#🔹 List all participants with optional search
@router.get("/", response_model=list[AdminParticipantListOut])
def list_all_participants(
    search: str | None = None,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):

    query = db.query(Participant).options(joinedload(Participant.event), joinedload(Participant.session)).filter(Participant.removed_at.is_(None))

    if search:
        search = f"%{search.lower()}%"
        query = query.filter(
            func.lower(Participant.first_name).like(search) |
            func.lower(Participant.last_name).like(search) |
            func.lower(Participant.email).like(search)
        )

    participants = query.all()

    email_keys = {
        (p.email or "").strip().lower()
        for p in participants
        if (p.email or "").strip()
    }
    no_show_counts: dict[str, int] = {}
    if email_keys:
        count_rows = (
            db.query(
                func.lower(ParticipantRemovalLog.email).label("email_key"),
                func.count(ParticipantRemovalLog.id).label("no_show_count"),
            )
            .filter(
                func.lower(ParticipantRemovalLog.email).in_(email_keys),
                ParticipantRemovalLog.removed_reason_code == "no_show",
            )
            .group_by(func.lower(ParticipantRemovalLog.email))
            .all()
        )
        no_show_counts = {
            row.email_key: int(row.no_show_count or 0)
            for row in count_rows
        }

    return [
        {
            "id": p.id,
            "event_id": p.event_id,
            "session_id": p.session_id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "email": p.email,
            "role": p.role,
            "is_minor": p.is_minor,
            "checked_in": p.checked_in,
            "is_waitlisted": p.is_waitlisted,
            "waiver_signed": p.waiver_signed,
            "waiver_verified": p.waiver_verified,
            "event_title": p.event.title if p.event else None,
            "event_type": p.event.event_type if p.event else None,
            "session_name": p.session.name if p.session else None,
            "no_show_count": no_show_counts.get((p.email or "").strip().lower(), 0),
            "priority": p.priority,
            "removed_at": p.removed_at,
            "removed_reason_code": p.removed_reason_code,
            "removed_reason_note": p.removed_reason_note,
            "removed_stage": p.removed_stage,
            "volunteer_type": p.volunteer_type,
            "volunteer_additional_types": p.volunteer_additional_types or [],
            "volunteer_is_versatile": p.volunteer_is_versatile,
        }
        for p in participants
    ]


@router.get("/removal-log", response_model=list[ParticipantRemovalLogOut])
def list_participant_removal_log(
    email: str | None = None,
    reason_code: str | None = None,
    event_id: str | None = None,
    event_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 200,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    query = _build_removal_log_query(
        db,
        email=email,
        reason_code=reason_code,
        event_id=event_id,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
    )
    rows = (
        query
        .order_by(ParticipantRemovalLog.created_at.desc())
        .limit(max(1, min(limit, 1000)))
        .all()
    )

    event_ids = {str(row.event_id) for row in rows if row.event_id}
    event_lookup = _build_event_lookup(db, event_ids)

    return [
        {
            "id": row.id,
            "participant_id": row.participant_id,
            "event_id": row.event_id,
            "event_title": (event_lookup.get(str(row.event_id)) or {}).get("title"),
            "event_type": (event_lookup.get(str(row.event_id)) or {}).get("event_type"),
            "first_name": row.first_name,
            "last_name": row.last_name,
            "email": row.email,
            "role": row.role,
            "was_waitlisted": row.was_waitlisted,
            "was_checked_in": row.was_checked_in,
            "was_waiver_verified": row.was_waiver_verified,
            "removed_reason_code": row.removed_reason_code,
            "removed_reason_note": row.removed_reason_note,
            "removed_stage": row.removed_stage,
            "removed_by_user_id": row.removed_by_user_id,
            "removed_by_user_email": row.removed_by_user_email,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.get("/removal-log/export.csv")
def export_participant_removal_log_csv(
    email: str | None = None,
    reason_code: str | None = None,
    event_id: str | None = None,
    event_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 5000,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    query = _build_removal_log_query(
        db,
        email=email,
        reason_code=reason_code,
        event_id=event_id,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
    )
    rows = (
        query
        .order_by(ParticipantRemovalLog.created_at.desc())
        .limit(max(1, min(limit, 20000)))
        .all()
    )

    event_ids = {str(row.event_id) for row in rows if row.event_id}
    event_lookup = _build_event_lookup(db, event_ids)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "created_at",
        "event_title",
        "event_type",
        "event_id",
        "participant_id",
        "first_name",
        "last_name",
        "email",
        "role",
        "removed_reason_code",
        "removed_reason_note",
        "removed_stage",
        "was_waitlisted",
        "was_checked_in",
        "was_waiver_verified",
        "removed_by_user_id",
        "removed_by_user_email",
    ])

    for row in rows:
        writer.writerow([
            row.created_at.isoformat() if row.created_at else "",
            (event_lookup.get(str(row.event_id)) or {}).get("title") or "",
            (event_lookup.get(str(row.event_id)) or {}).get("event_type") or "",
            row.event_id,
            row.participant_id,
            row.first_name,
            row.last_name,
            row.email,
            row.role,
            row.removed_reason_code,
            row.removed_reason_note or "",
            row.removed_stage,
            row.was_waitlisted,
            row.was_checked_in,
            row.was_waiver_verified,
            row.removed_by_user_id or "",
            row.removed_by_user_email or "",
        ])

    csv_text = output.getvalue()
    output.close()
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")

    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=participant-removal-log-{timestamp}.csv"},
    )

#🔹 List participants for an event (admin view)
@router.patch("/{participant_id}/checkin")
async def check_in_participant(
    participant_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    participant = (
    _base_active_participant_query(db)
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

    participant = _base_active_participant_query(db).filter(Participant.id == participant_id).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Already in session → no-op
    if participant.session_id == payload.session_id:
        return {"success": True}

    count = db.query(Participant).filter(
        Participant.session_id == payload.session_id,
        Participant.removed_at.is_(None),
        func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
    ).count()

    session_capacity = session.capacity or DEFAULT_SESSION_CAPACITY
    if not _is_volunteer_role(participant.role) and count >= session_capacity:
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
    participant = _base_active_participant_query(db).filter(Participant.id == participant_id).first()

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
