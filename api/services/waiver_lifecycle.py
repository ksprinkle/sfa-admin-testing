from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.participant_waivers import ParticipantWaiver
from api.models.waiver_audit_events import WaiverAuditEvent


STATUS_DRAFT = ParticipantWaiver.STATUS_DRAFT
STATUS_SENT = ParticipantWaiver.STATUS_SENT
STATUS_VIEWED = ParticipantWaiver.STATUS_VIEWED
STATUS_SIGNED = ParticipantWaiver.STATUS_SIGNED
STATUS_ARCHIVED = ParticipantWaiver.STATUS_ARCHIVED
STATUS_SUPERSEDED = ParticipantWaiver.STATUS_SUPERSEDED

LIFECYCLE_STATUSES = {
    STATUS_DRAFT,
    STATUS_SENT,
    STATUS_VIEWED,
    STATUS_SIGNED,
    STATUS_ARCHIVED,
    STATUS_SUPERSEDED,
}

_STATUS_TRANSITIONS: dict[str, set[str]] = {
    STATUS_DRAFT: {STATUS_SENT, STATUS_VIEWED, STATUS_SIGNED, STATUS_ARCHIVED},
    STATUS_SENT: {STATUS_DRAFT, STATUS_VIEWED, STATUS_SIGNED, STATUS_ARCHIVED},
    STATUS_VIEWED: {STATUS_DRAFT, STATUS_SIGNED, STATUS_ARCHIVED},
    STATUS_SIGNED: {STATUS_DRAFT, STATUS_ARCHIVED, STATUS_SUPERSEDED},
    STATUS_ARCHIVED: {STATUS_DRAFT, STATUS_SUPERSEDED},
    STATUS_SUPERSEDED: set(),
}


def canonicalize_waiver_status(raw_status: str | None) -> str:
    status = (raw_status or "").strip().lower()

    if status == ParticipantWaiver.LEGACY_STATUS_PENDING:
        return STATUS_DRAFT
    if status == ParticipantWaiver.LEGACY_STATUS_VERIFIED:
        return STATUS_SIGNED
    if status in LIFECYCLE_STATUSES:
        return status

    return STATUS_DRAFT


def derive_participant_waiver_status(
    *,
    waiver: ParticipantWaiver | None,
    waiver_signed: bool,
    waiver_verified: bool,
) -> str:
    if waiver is not None:
        status = canonicalize_waiver_status(waiver.status)
        if status == STATUS_SIGNED and waiver_verified:
            return STATUS_SIGNED
        return status

    if waiver_verified:
        return STATUS_SIGNED
    if waiver_signed:
        return STATUS_VIEWED
    return STATUS_DRAFT


def transition_waiver_status(
    db: Session,
    waiver: ParticipantWaiver,
    *,
    to_status: str,
    actor_user_id: str | None,
    source: str | None = None,
    event_type: str = "status_transition",
    details: dict[str, Any] | None = None,
    occurred_at: datetime | None = None,
) -> None:
    now = occurred_at or datetime.utcnow()

    from_status = canonicalize_waiver_status(waiver.status)
    normalized_to_status = canonicalize_waiver_status(to_status)

    if normalized_to_status not in LIFECYCLE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid waiver lifecycle status")

    if normalized_to_status != from_status:
        allowed = _STATUS_TRANSITIONS.get(from_status, set())
        if normalized_to_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid waiver lifecycle transition: {from_status} -> {normalized_to_status}",
            )

        waiver.status = normalized_to_status
        waiver.lifecycle_updated_at = now

        if normalized_to_status == STATUS_SENT and waiver.sent_at is None:
            waiver.sent_at = now
        elif normalized_to_status == STATUS_VIEWED and waiver.viewed_at is None:
            waiver.viewed_at = now
        elif normalized_to_status == STATUS_SIGNED and waiver.signed_at is None:
            waiver.signed_at = now
        elif normalized_to_status == STATUS_ARCHIVED and waiver.archived_at is None:
            waiver.archived_at = now
        elif normalized_to_status == STATUS_SUPERSEDED and waiver.superseded_at is None:
            waiver.superseded_at = now

    db.add(
        WaiverAuditEvent(
            waiver_id=waiver.id,
            event_type=event_type,
            from_status=from_status,
            to_status=normalized_to_status,
            actor_user_id=actor_user_id,
            source=source,
            details=details,
        )
    )