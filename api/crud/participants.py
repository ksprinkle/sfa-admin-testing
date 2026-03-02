from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from sqlalchemy import func

from api.models.participants import Participant
from api.models.events import Event
from api.schemas.participants import ParticipantCreate


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


def promote_from_waitlist(db: Session, event: Event):
    if event.participant_capacity is None:
        return None

    confirmed_count = get_confirmed_participant_count(db, event.id)

    if confirmed_count >= event.participant_capacity:
        return None

    next_waitlisted = (
        db.query(Participant)
        .filter(
            Participant.event_id == event.id,
            Participant.is_waitlisted == True,
        )
        .order_by(Participant.created_at.asc())
        .first()
    )

    if not next_waitlisted:
        return None

    next_waitlisted.is_waitlisted = False

    db.commit()
    db.refresh(next_waitlisted)

    return next_waitlisted