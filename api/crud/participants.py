from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from api.models.participants import Participant
from api.models.events import Event
from api.schemas.participants import ParticipantCreate
from sqlalchemy import func


def create_participant(
    db: Session,
    event: Event,
    participant_in: ParticipantCreate,
):
    participant = Participant(
        event_id=event.id,
        **participant_in.dict(),
    )

    db.add(participant)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Participant already registered for this event",
        )

    db.refresh(participant)
    return participant
    from sqlalchemy import func

def get_participant_count(db: Session, event_id: int) -> int:
    return (
        db.query(func.count(Participant.id))
        .filter(Participant.event_id == event_id)
        .scalar()
    )
