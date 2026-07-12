from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from sqlalchemy import func, case

from api.models.participants import Participant
from api.models.events import Event
from api.schemas.participants import ParticipantCreate
from api.services.admin_audit import record_admin_audit_event
from api.services.event_operations_timeline import (
    AUDIT_ACTION_PROMOTE_WAITLIST,
    AUDIT_DOMAIN_PARTICIPANTS,
)
from api.services.session_service import get_next_available_session

def create_participant(
    db: Session,
    event: Event,
    participant_in: ParticipantCreate,
    is_waitlisted: bool = False,
):
    participant_payload = participant_in.model_dump(exclude={"event_id"})

    participant = Participant(
        event_id=event.id,
        is_waitlisted=is_waitlisted,
        **participant_payload,
    )

    db.add(participant)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Participant already registered for this event",
        )

    return participant


def get_confirmed_participant_count(db: Session, event_id):
    return (
        db.query(func.count(Participant.id))
        .filter(
            Participant.event_id == event_id,
            Participant.removed_at.is_(None),
            Participant.is_waitlisted == False,
            func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
        )
        .scalar()
    )


def get_participants_for_event(db: Session, event_id):
    return (
        db.query(Participant)
        .filter(
            Participant.event_id == event_id,
            Participant.removed_at.is_(None),
        )
        .order_by(Participant.created_at.asc())
        .all()
    )


def get_waitlist_query(db: Session, event: Event, exclude_participant_id=None):
    query = (
        db.query(Participant)
        .filter(
            Participant.event_id == event.id,
            Participant.removed_at.is_(None),
            Participant.is_waitlisted == True,
            func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
        )
    )

    if exclude_participant_id is not None:
        query = query.filter(Participant.id != exclude_participant_id)

    # Promotion order: explicit priorities first (1 high, 2 medium, 3 low), then unset (0).
    priority_rank = case(
        (Participant.priority == 1, 1),
        (Participant.priority == 2, 2),
        (Participant.priority == 3, 3),
        else_=4,
    )

    return query.order_by(
        priority_rank.asc(),
        Participant.created_at.asc(),
        Participant.id.asc(),
    )


def get_next_waitlisted_participant(db: Session, event: Event, exclude_participant_id=None):
    return get_waitlist_query(db, event, exclude_participant_id=exclude_participant_id).first()


def assign_participant_to_next_available_session(db: Session, participant: Participant):
    available_session = get_next_available_session(db, participant.event_id)
    if available_session:
        participant.session_id = available_session.id
    return available_session


def promote_specific_waitlisted_participant(db: Session, participant: Participant):
    participant.is_waitlisted = False
    assign_participant_to_next_available_session(db, participant)

    db.commit()
    db.refresh(participant)

    return participant


def promote_from_waitlist(db: Session, event: Event, exclude_participant_id=None, actor_user_id=None):
    if event.participant_capacity is None:
        next_waitlisted = get_next_waitlisted_participant(
            db, event, exclude_participant_id=exclude_participant_id
        )
    else:
        confirmed_count = get_confirmed_participant_count(db, event.id)

        if confirmed_count >= event.participant_capacity:
            return None

        next_waitlisted = get_next_waitlisted_participant(
            db, event, exclude_participant_id=exclude_participant_id
        )

    if not next_waitlisted:
        return None

    next_waitlisted.is_waitlisted = False
    assign_participant_to_next_available_session(db, next_waitlisted)
    # actor_user_id is None when this fires automatically (e.g. a spot opened
    # up after a removal, or no-show promotion) rather than from a direct
    # admin "Promote" action — same timeline event either way, see
    # api/services/event_operations_timeline.py.
    record_admin_audit_event(
        db,
        domain=AUDIT_DOMAIN_PARTICIPANTS,
        action=AUDIT_ACTION_PROMOTE_WAITLIST,
        actor_user_id=actor_user_id,
        target_type="participant",
        target_id=str(next_waitlisted.id),
        target_display=f"{next_waitlisted.first_name} {next_waitlisted.last_name}",
        details={"trigger": "automatic"} if actor_user_id is None else None,
    )

    db.commit()
    db.refresh(next_waitlisted)

    return next_waitlisted