from models.participants import Participant
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.exc import IntegrityError
from crud.participants import promote_from_waitlist, promote_specific_waitlisted_participant
from crud.participants import create_participant as create_participant_record
from db.session import get_db
from dependencies import require_admin
from models.events import Event
from sqlalchemy.orm import joinedload
from datetime import date, datetime
from types import SimpleNamespace
from schemas.participants import AdminParticipantListOut, ParticipantAction, ParticipantCreate, ParticipantOut, ParticipantUpdate, SessionUpdate, ParticipantRemovalLogOut
from ws_manager import manager
import json
from sqlalchemy import case, func, false
import logging
import csv
import io
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from models.sessions import Session as EventSession
from services.session_service import (
    DEFAULT_SESSION_CAPACITY,
    get_session_participant_count,
)
from backend.app.services.assignment_evaluator import evaluate_assignment
from backend.app.services.session_recommender import recommend_sessions
from models.participant_removal_log import ParticipantRemovalLog


def _is_volunteer_role(value: str | None) -> bool:
    return (value or "").strip().lower() == "volunteer"

router = APIRouter(
    prefix="/admin/participants",
    tags=["Admin Participants"],
)

logger = logging.getLogger(__name__)


class AdminParticipantCreate(ParticipantCreate):
    session_id: UUID | None = None
    notes: str | None = None


class AssignmentEvaluationIn(BaseModel):
    participant_id: UUID
    session_id: UUID


class BatchAssignmentEvaluationIn(BaseModel):
    participant_id: UUID
    session_ids: list[UUID]


def _base_active_participant_query(db: DBSession):
    return db.query(Participant).filter(Participant.removed_at.is_(None))


def _derive_event_session_stats(db: DBSession, event_id: UUID):
    sessions = (
        db.query(EventSession)
        .filter(EventSession.event_id == event_id)
        .order_by(EventSession.start_time.asc(), EventSession.name.asc())
        .all()
    )

    session_ids = [session.id for session in sessions]

    counts_by_session: dict[str, dict[str, int]] = {}
    if session_ids:
        count_rows = (
            db.query(
                Participant.session_id.label("session_id"),
                func.count(Participant.id).label("current_count"),
                func.sum(case((Participant.requires_assistance.is_(True), 1), else_=0)).label("assistance_count"),
                func.sum(case((Participant.is_minor.is_(True), 1), else_=0)).label("minor_count"),
            )
            .filter(
                Participant.event_id == event_id,
                Participant.removed_at.is_(None),
                Participant.session_id.in_(session_ids),
                func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
            )
            .group_by(Participant.session_id)
            .all()
        )
        counts_by_session = {
            str(row.session_id): {
                "current_count": int(row.current_count or 0),
                "assistance_count": int(row.assistance_count or 0),
                "minor_count": int(row.minor_count or 0),
            }
            for row in count_rows
        }

    totals_row = (
        db.query(
            func.count(Participant.id).label("total_count"),
            func.sum(case((Participant.requires_assistance.is_(True), 1), else_=0)).label("total_assistance"),
            func.sum(case((Participant.is_minor.is_(True), 1), else_=0)).label("total_minors"),
        )
        .filter(
            Participant.event_id == event_id,
            Participant.removed_at.is_(None),
            func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
        )
        .first()
    )

    total_count = int(getattr(totals_row, "total_count", 0) or 0)
    total_assistance = int(getattr(totals_row, "total_assistance", 0) or 0)
    total_minors = int(getattr(totals_row, "total_minors", 0) or 0)

    assistance_ratio = (total_assistance / total_count) if total_count > 0 else 0.0
    minor_ratio = (total_minors / total_count) if total_count > 0 else 0.0

    derived_sessions = []
    for session in sessions:
        capacity = int(session.capacity or DEFAULT_SESSION_CAPACITY)
        session_counts = counts_by_session.get(str(session.id), {})
        target_assistance = int(round(capacity * assistance_ratio))
        target_minors = int(round(capacity * minor_ratio))

        derived_sessions.append(
            SimpleNamespace(
                id=session.id,
                session_id=session.id,
                current_count=int(session_counts.get("current_count", 0)),
                capacity=capacity,
                assistance_count=int(session_counts.get("assistance_count", 0)),
                target_assistance=target_assistance,
                minor_count=int(session_counts.get("minor_count", 0)),
                target_minors=target_minors,
            )
        )

    return derived_sessions


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
        "requires_assistance",
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
        if participant.requires_assistance is None:
            participant.requires_assistance = False

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

@router.post("/", response_model=AdminParticipantListOut)
def create_admin_participant(
    data: AdminParticipantCreate,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == data.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    target_session = None
    if data.session_id is not None:
        target_session = db.query(EventSession).filter(EventSession.id == data.session_id).first()
        if not target_session:
            raise HTTPException(status_code=400, detail="Session not found")
        if str(target_session.event_id) != str(event.id):
            raise HTTPException(status_code=400, detail="Session does not belong to participant event")

        if not _is_volunteer_role(data.role):
            current_count = get_session_participant_count(db, target_session.id)
            session_capacity = target_session.capacity or DEFAULT_SESSION_CAPACITY
            if current_count >= session_capacity:
                raise HTTPException(status_code=400, detail="Session is full")

    participant_in = ParticipantCreate(
        event_id=data.event_id,
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        role=data.role,
        is_minor=data.is_minor,
        requires_assistance=data.requires_assistance,
        priority=data.priority,
        volunteer_type=data.volunteer_type,
        volunteer_additional_types=data.volunteer_additional_types,
        volunteer_is_versatile=data.volunteer_is_versatile,
    )

    participant = create_participant_record(
        db,
        event,
        participant_in,
        is_waitlisted=False,
    )

    participant.notes = data.notes
    participant.session_id = target_session.id if target_session else None

    if target_session is not None:
        participant.is_waitlisted = False

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Participant already registered for this event",
        )

    db.refresh(participant)

    return {
        "id": participant.id,
        "event_id": participant.event_id,
        "session_id": participant.session_id,
        "first_name": participant.first_name,
        "last_name": participant.last_name,
        "email": participant.email,
        "role": participant.role,
        "is_minor": participant.is_minor,
        "requires_assistance": participant.requires_assistance,
        "checked_in": participant.checked_in,
        "is_waitlisted": participant.is_waitlisted,
        "priority": participant.priority,
        "waiver_signed": participant.waiver_signed,
        "waiver_verified": participant.waiver_verified,
        "event_title": event.title,
        "event_type": event.event_type,
        "session_name": target_session.name if target_session else None,
        "notes": participant.notes,
        "no_show_count": 0,
        "removed_at": participant.removed_at,
        "removed_reason_code": participant.removed_reason_code,
        "removed_reason_note": participant.removed_reason_note,
        "removed_stage": participant.removed_stage,
        "volunteer_type": participant.volunteer_type,
        "volunteer_additional_types": participant.volunteer_additional_types or [],
        "volunteer_is_versatile": participant.volunteer_is_versatile,
    }

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
            "requires_assistance": p.requires_assistance,
            "checked_in": p.checked_in,
            "is_waitlisted": p.is_waitlisted,
            "waiver_signed": p.waiver_signed,
            "waiver_verified": p.waiver_verified,
            "event_title": p.event.title if p.event else None,
            "event_type": p.event.event_type if p.event else None,
            "session_name": p.session.name if p.session else None,
            "notes": p.notes,
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


@router.get("/{participant_id}/recommended-sessions")
def get_recommended_sessions(
    participant_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    participant = _base_active_participant_query(db).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    derived_sessions = _derive_event_session_stats(db, participant.event_id)

    recommended = recommend_sessions(participant, derived_sessions)
    if recommended is Ellipsis or recommended is None:
        recommended = []

    top_three = list(recommended)[:3]

    return {"recommendations": top_three}


@router.post("/evaluate-assignment")
def evaluate_participant_assignment(
    payload: AssignmentEvaluationIn,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    participant = _base_active_participant_query(db).filter(Participant.id == payload.participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    session_stats = _derive_event_session_stats(db, participant.event_id)
    selected_session = next(
        (session for session in session_stats if str(getattr(session, "session_id", "")) == str(payload.session_id)),
        None,
    )

    if not selected_session:
        raise HTTPException(status_code=404, detail="Session not found for participant event")

    return evaluate_assignment(participant, selected_session, session_stats)


@router.post("/evaluate-multiple-assignments")
def evaluate_multiple_participant_assignments(
    payload: BatchAssignmentEvaluationIn,
    db: DBSession = Depends(get_db),
    _current_user = Depends(require_admin),
):
    participant = _base_active_participant_query(db).filter(Participant.id == payload.participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    session_stats = _derive_event_session_stats(db, participant.event_id)
    stats_by_id = {str(s.session_id): s for s in session_stats}

    results = {}
    for session_id in payload.session_ids:
        sid = str(session_id)
        session = stats_by_id.get(sid)
        if session is None:
            results[sid] = {"status": "avoid", "messages": ["Session not found"]}
        else:
            results[sid] = evaluate_assignment(participant, session, session_stats)

    return {"results": results}


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
