from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.models.event_operations import EventOperation
from api.models.events import Event
from api.models.participants import Participant
from api.models.volunteer_assignments import VolunteerAssignment
from api.services.admin_audit import record_admin_audit_event


VALID_OPERATIONAL_STATUSES = {
    EventOperation.OPERATIONAL_STATUS_DRAFT,
    EventOperation.OPERATIONAL_STATUS_READY,
    EventOperation.OPERATIONAL_STATUS_ACTIVE,
    EventOperation.OPERATIONAL_STATUS_AT_RISK,
    EventOperation.OPERATIONAL_STATUS_COMPLETED,
}


def _normalize_status(value: str | None, default: str) -> str:
    return (value or default).strip().lower() or default


def _calc_capacity_status(*, participant_capacity: int | None, participant_count: int) -> str:
    if participant_capacity is None or participant_capacity <= 0:
        return EventOperation.CAPACITY_STATUS_UNKNOWN

    ratio = participant_count / float(participant_capacity)
    if ratio >= 1.0:
        return EventOperation.CAPACITY_STATUS_AT_CAPACITY
    if ratio >= 0.85:
        return EventOperation.CAPACITY_STATUS_NEAR_CAPACITY
    return EventOperation.CAPACITY_STATUS_AVAILABLE


def _calc_readiness(*, blockers: list[str], capacity_status: str) -> tuple[str, float]:
    if blockers:
        return EventOperation.READINESS_STATUS_NOT_READY, 0.0

    if capacity_status == EventOperation.CAPACITY_STATUS_AT_CAPACITY:
        return EventOperation.READINESS_STATUS_PARTIAL, 60.0
    if capacity_status == EventOperation.CAPACITY_STATUS_NEAR_CAPACITY:
        return EventOperation.READINESS_STATUS_PARTIAL, 80.0

    return EventOperation.READINESS_STATUS_READY, 100.0


def _active_participant_count(db: Session, event_id: UUID) -> int:
    return int(
        db.query(func.count(Participant.id))
        .filter(
            Participant.event_id == event_id,
            Participant.removed_at.is_(None),
            func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
        )
        .scalar()
        or 0
    )


def _active_volunteer_assignment_count(db: Session, event_id: UUID) -> int:
    return int(
        db.query(func.count(VolunteerAssignment.id))
        .filter(
            VolunteerAssignment.event_id == event_id,
            VolunteerAssignment.status.in_(
                [
                    VolunteerAssignment.STATUS_ASSIGNED,
                    VolunteerAssignment.STATUS_CONFIRMED,
                ]
            ),
        )
        .scalar()
        or 0
    )


def _get_or_create_event_operations(db: Session, event: Event) -> EventOperation:
    record = db.query(EventOperation).filter(EventOperation.event_id == event.id).first()
    if record:
        return record

    record = EventOperation(
        event_id=event.id,
        participant_capacity=event.participant_capacity,
        volunteer_capacity=event.volunteer_capacity,
    )
    db.add(record)
    db.flush()
    return record


def refresh_event_operations(
    db: Session,
    *,
    event_id: UUID,
    actor_user_id: str | None,
    additional_blockers: list[str] | None = None,
) -> EventOperation:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    record = _get_or_create_event_operations(db, event)

    participant_count = _active_participant_count(db, event.id)
    volunteer_assignment_count = _active_volunteer_assignment_count(db, event.id)

    participant_capacity = event.participant_capacity
    volunteer_capacity = event.volunteer_capacity

    blockers: list[str] = []
    if event.status != "published":
        blockers.append("event_not_published")
    if participant_capacity is not None and participant_count > participant_capacity:
        blockers.append("participant_over_capacity")
    if volunteer_capacity is not None and volunteer_assignment_count < volunteer_capacity:
        blockers.append("volunteer_under_capacity")
    if additional_blockers:
        for blocker in additional_blockers:
            text = (blocker or "").strip().lower()
            if text and text not in blockers:
                blockers.append(text)

    capacity_status = _calc_capacity_status(
        participant_capacity=participant_capacity,
        participant_count=participant_count,
    )
    readiness_status, readiness_score = _calc_readiness(
        blockers=blockers,
        capacity_status=capacity_status,
    )

    record.participant_capacity = participant_capacity
    record.participant_count = participant_count
    record.volunteer_capacity = volunteer_capacity
    record.volunteer_assignment_count = volunteer_assignment_count
    record.capacity_status = capacity_status
    record.readiness_status = readiness_status
    record.readiness_score = readiness_score
    record.blockers = blockers
    if record.operational_status == EventOperation.OPERATIONAL_STATUS_DRAFT and readiness_status == EventOperation.READINESS_STATUS_READY:
        record.operational_status = EventOperation.OPERATIONAL_STATUS_READY
    record.updated_by_user_id = actor_user_id
    record.updated_at = datetime.now(UTC).replace(tzinfo=None)

    record_admin_audit_event(
        db,
        domain="event_operations",
        action="event_operations_refreshed",
        actor_user_id=actor_user_id,
        target_type="event",
        target_id=str(event.id),
        target_display=event.title,
        source="admin.event_operations.refresh",
        details={
            "capacity_status": record.capacity_status,
            "readiness_status": record.readiness_status,
            "readiness_score": record.readiness_score,
            "blockers": record.blockers,
        },
    )

    db.commit()
    db.refresh(record)
    return record


def set_event_operational_status(
    db: Session,
    *,
    event_id: UUID,
    operational_status: str,
    notes: str | None,
    actor_user_id: str | None,
) -> EventOperation:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    normalized = _normalize_status(operational_status, EventOperation.OPERATIONAL_STATUS_DRAFT)
    if normalized not in VALID_OPERATIONAL_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid operational status")

    record = _get_or_create_event_operations(db, event)
    previous = record.operational_status
    record.operational_status = normalized
    record.notes = (notes or "").strip() or None
    record.updated_by_user_id = actor_user_id
    record.updated_at = datetime.now(UTC).replace(tzinfo=None)

    record_admin_audit_event(
        db,
        domain="event_operations",
        action="event_operational_status_updated",
        actor_user_id=actor_user_id,
        target_type="event",
        target_id=str(event.id),
        target_display=event.title,
        source="admin.event_operations.status",
        details={
            "previous_operational_status": previous,
            "new_operational_status": normalized,
            "notes": record.notes,
        },
    )

    db.commit()
    db.refresh(record)
    return record


def get_event_operations(db: Session, *, event_id: UUID) -> EventOperation:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    record = db.query(EventOperation).filter(EventOperation.event_id == event_id).first()
    if record:
        return record

    return refresh_event_operations(db, event_id=event_id, actor_user_id=None)


def list_event_operations(
    db: Session,
    *,
    operational_status: str | None = None,
    readiness_status: str | None = None,
) -> list[EventOperation]:
    query = db.query(EventOperation)
    if operational_status:
        query = query.filter(
            EventOperation.operational_status == _normalize_status(operational_status, EventOperation.OPERATIONAL_STATUS_DRAFT)
        )
    if readiness_status:
        query = query.filter(
            EventOperation.readiness_status == _normalize_status(readiness_status, EventOperation.READINESS_STATUS_NOT_READY)
        )
    return query.order_by(EventOperation.updated_at.desc(), EventOperation.created_at.desc()).all()
