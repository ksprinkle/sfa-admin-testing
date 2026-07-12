from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from api.models.admin_audit_events import AdminAuditEvent
from api.models.participants import Participant
from api.schemas.event_operations_timeline import (
    EventOperationsTimelineEntryOut,
    EventOperationsTimelineEntryType,
    EventOperationsTimelineOut,
)

# Audit domain/action pairs used for event types that have no dedicated
# timestamp column on Participant (session assignment, waitlist promotion).
# Recorded via api.services.admin_audit.record_admin_audit_event at the
# points where those actions occur (see api/routers/admin_participants.py).
AUDIT_DOMAIN_PARTICIPANTS = "participants"
AUDIT_ACTION_ASSIGN_SESSION = "assign_session"
AUDIT_ACTION_PROMOTE_WAITLIST = "promote_waitlist"

# Adding a new timeline entry type is a three-step, additive change:
#   1. add a value to EventOperationsTimelineEntryType (schema)
#   2. add an icon/title entry below
#   3. add a `_build_*_entries(...)` function and call it from
#      `get_event_operations_timeline`
# No existing entry type's handling needs to change.
_ICON_BY_TYPE: dict[EventOperationsTimelineEntryType, str] = {
    EventOperationsTimelineEntryType.PARTICIPANT_CHECK_IN: "✅",
    EventOperationsTimelineEntryType.VOLUNTEER_CHECK_IN: "\U0001F9CD",
    EventOperationsTimelineEntryType.SESSION_ASSIGNMENT: "\U0001F3C4",
    EventOperationsTimelineEntryType.WAITLIST_PROMOTION: "⬆️",
    EventOperationsTimelineEntryType.WAIVER_VERIFICATION: "\U0001F4DD",
}

_TITLE_BY_TYPE: dict[EventOperationsTimelineEntryType, str] = {
    EventOperationsTimelineEntryType.PARTICIPANT_CHECK_IN: "Participant Check-In",
    EventOperationsTimelineEntryType.VOLUNTEER_CHECK_IN: "Volunteer Check-In",
    EventOperationsTimelineEntryType.SESSION_ASSIGNMENT: "Session Assignment",
    EventOperationsTimelineEntryType.WAITLIST_PROMOTION: "Waitlist Promotion",
    EventOperationsTimelineEntryType.WAIVER_VERIFICATION: "Waiver Verification",
}


def _is_volunteer_role(value: str | None) -> bool:
    return (value or "").strip().lower() == "volunteer"


def _participant_display_name(participant: Participant) -> str:
    return f"{participant.first_name} {participant.last_name}".strip() or participant.email


@dataclass
class _Entry:
    entry_id: str
    entry_type: EventOperationsTimelineEntryType
    occurred_at: datetime
    description: str
    reference_id: str | None

    def to_out(self) -> EventOperationsTimelineEntryOut:
        return EventOperationsTimelineEntryOut(
            entry_id=self.entry_id,
            entry_type=self.entry_type,
            occurred_at=self.occurred_at,
            icon=_ICON_BY_TYPE[self.entry_type],
            title=_TITLE_BY_TYPE[self.entry_type],
            description=self.description,
            reference_id=self.reference_id,
        )


def _build_checkin_entries(participants: list[Participant]) -> list[_Entry]:
    entries: list[_Entry] = []
    for participant in participants:
        if not participant.checked_in_at:
            continue
        entry_type = (
            EventOperationsTimelineEntryType.VOLUNTEER_CHECK_IN
            if _is_volunteer_role(participant.role)
            else EventOperationsTimelineEntryType.PARTICIPANT_CHECK_IN
        )
        entries.append(
            _Entry(
                entry_id=f"participant:{participant.id}:checkin",
                entry_type=entry_type,
                occurred_at=participant.checked_in_at,
                description=f"{_participant_display_name(participant)} checked in",
                reference_id=str(participant.id),
            )
        )
    return entries


def _build_waiver_verification_entries(participants: list[Participant]) -> list[_Entry]:
    entries: list[_Entry] = []
    for participant in participants:
        waiver = participant.waiver
        if waiver is None or not waiver.verified_at:
            continue
        entries.append(
            _Entry(
                entry_id=f"waiver:{waiver.id}:verified",
                entry_type=EventOperationsTimelineEntryType.WAIVER_VERIFICATION,
                occurred_at=waiver.verified_at,
                description=f"{_participant_display_name(participant)}'s waiver was verified",
                reference_id=str(waiver.id),
            )
        )
    return entries


def _build_audit_sourced_entries(
    db: Session,
    *,
    participants_by_id: dict[str, Participant],
    action: str,
    entry_type: EventOperationsTimelineEntryType,
    describe: "callable[[Participant], str]",
) -> list[_Entry]:
    if not participants_by_id:
        return []

    audit_events = (
        db.query(AdminAuditEvent)
        .filter(
            AdminAuditEvent.domain == AUDIT_DOMAIN_PARTICIPANTS,
            AdminAuditEvent.action == action,
            AdminAuditEvent.target_id.in_(participants_by_id.keys()),
        )
        .all()
    )

    entries: list[_Entry] = []
    for audit_event in audit_events:
        participant = participants_by_id.get(str(audit_event.target_id))
        if participant is None:
            continue
        entries.append(
            _Entry(
                entry_id=f"audit:{audit_event.id}",
                entry_type=entry_type,
                occurred_at=audit_event.created_at,
                description=describe(participant),
                reference_id=str(participant.id),
            )
        )
    return entries


def get_event_operations_timeline(db: Session, event_id: UUID) -> EventOperationsTimelineOut:
    participants = (
        db.query(Participant)
        .options(joinedload(Participant.waiver))
        .filter(
            Participant.event_id == event_id,
            Participant.removed_at.is_(None),
        )
        .all()
    )
    participants_by_id = {str(p.id): p for p in participants}

    entries: list[_Entry] = []
    entries.extend(_build_checkin_entries(participants))
    entries.extend(_build_waiver_verification_entries(participants))
    entries.extend(
        _build_audit_sourced_entries(
            db,
            participants_by_id=participants_by_id,
            action=AUDIT_ACTION_ASSIGN_SESSION,
            entry_type=EventOperationsTimelineEntryType.SESSION_ASSIGNMENT,
            describe=lambda p: f"{_participant_display_name(p)} was assigned to a session",
        )
    )
    entries.extend(
        _build_audit_sourced_entries(
            db,
            participants_by_id=participants_by_id,
            action=AUDIT_ACTION_PROMOTE_WAITLIST,
            entry_type=EventOperationsTimelineEntryType.WAITLIST_PROMOTION,
            describe=lambda p: f"{_participant_display_name(p)} was promoted from the waitlist",
        )
    )

    entries.sort(key=lambda entry: entry.occurred_at, reverse=True)

    return EventOperationsTimelineOut(
        event_id=str(event_id),
        entries=[entry.to_out() for entry in entries],
    )
