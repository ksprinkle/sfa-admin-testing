from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from sqlalchemy import func

from api.models.participants import Participant
from api.models.events import Event
from api.schemas.participants import ParticipantCreate
from api.services.session_service import get_next_available_session

def create_participant(
    db: Session,
    event: Event,
    participant_in: ParticipantCreate,
    is_waitlisted: bool = False,
):
    participant = Participant(
        event_id=event.id,
        is_waitlisted=is_waitlisted,
        **participant_in.model_dump(),
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
            Participant.is_waitlisted == False,
        )
        .scalar()
    )


def get_participants_for_event(db: Session, event_id):
    return (
        db.query(Participant)
        .filter(Participant.event_id == event_id)
        .order_by(Participant.created_at.asc())
        .all()
    )


def get_waitlist_query(db: Session, event: Event, exclude_participant_id=None):
    query = (
        db.query(Participant)
        .filter(
            Participant.event_id == event.id,
            Participant.is_waitlisted == True,
        )
    )

    if exclude_participant_id is not None:
        query = query.filter(Participant.id != exclude_participant_id)

    return query.order_by(
        Participant.priority.asc(),
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


def promote_from_waitlist(db: Session, event: Event, exclude_participant_id=None):
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

    db.commit()
    db.refresh(next_waitlisted)

    return next_waitlisted