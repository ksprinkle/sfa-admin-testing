from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from api.models.participants import Participant
from api.models.participant_waivers import ParticipantWaiver
from api.schemas.participant_timeline import ParticipantTimelineEventOut, ParticipantTimelineEventType


_DISPLAY_TITLE_BY_EVENT_TYPE = {
    ParticipantTimelineEventType.REGISTRATION_CREATED: "Registration Created",
    ParticipantTimelineEventType.WAIVER_TEMPLATE_ASSIGNED: "Waiver Template Assigned",
    ParticipantTimelineEventType.WAIVER_SIGNED: "Waiver Signed",
    ParticipantTimelineEventType.PDF_GENERATED: "PDF Artifact Generated",
    ParticipantTimelineEventType.PDF_VERIFIED: "PDF Artifact Verified",
    ParticipantTimelineEventType.CHECKIN_COMPLETED: "Check-In Completed",
}


@dataclass
class _TimelineEvent:
    event_id: str
    participant_id: UUID
    event_type: ParticipantTimelineEventType
    event_timestamp: datetime
    source_system: str
    display_details: str | None
    reference_id: str | None
    sort_key: str

    def to_out(self) -> ParticipantTimelineEventOut:
        return ParticipantTimelineEventOut(
            event_id=self.event_id,
            participant_id=self.participant_id,
            event_type=self.event_type,
            event_timestamp=self.event_timestamp,
            source_system=self.source_system,
            display_title=_DISPLAY_TITLE_BY_EVENT_TYPE[self.event_type],
            display_details=self.display_details,
            reference_id=self.reference_id,
            sort_key=self.sort_key,
        )


def _safe_details_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _event_sort_key(event_type: ParticipantTimelineEventType, reference_id: str | None, event_id: str) -> str:
    return f"{event_type.value}:{reference_id or event_id}"


def _new_event(
    *,
    event_id: str,
    participant_id: UUID,
    event_type: ParticipantTimelineEventType,
    event_timestamp: datetime,
    source_system: str,
    display_details: str | None,
    reference_id: str | None,
) -> _TimelineEvent:
    return _TimelineEvent(
        event_id=event_id,
        participant_id=participant_id,
        event_type=event_type,
        event_timestamp=event_timestamp,
        source_system=source_system,
        display_details=display_details,
        reference_id=reference_id,
        sort_key=_event_sort_key(event_type, reference_id, event_id),
    )


def _build_registration_event(participant: Participant) -> list[_TimelineEvent]:
    if participant.created_at is None:
        return []

    return [
        _new_event(
            event_id=f"participant:{participant.id}:registration",
            participant_id=participant.id,
            event_type=ParticipantTimelineEventType.REGISTRATION_CREATED,
            event_timestamp=participant.created_at,
            source_system="participants",
            display_details=_safe_details_text(f"{participant.first_name} {participant.last_name} ({participant.email})"),
            reference_id=str(participant.id),
        )
    ]


def _build_checkin_event(participant: Participant) -> list[_TimelineEvent]:
    if not participant.checked_in_at:
        return []

    return [
        _new_event(
            event_id=f"participant:{participant.id}:checkin",
            participant_id=participant.id,
            event_type=ParticipantTimelineEventType.CHECKIN_COMPLETED,
            event_timestamp=participant.checked_in_at,
            source_system="participants",
            display_details="Participant marked checked-in",
            reference_id=str(participant.id),
        )
    ]


def _build_waiver_template_assignment_event(participant: Participant, waiver: ParticipantWaiver) -> list[_TimelineEvent]:
    metadata = waiver.version_metadata if isinstance(waiver.version_metadata, dict) else {}
    template_id = metadata.get("waiver_template_id")
    template_version = metadata.get("template_version")

    if not template_id and template_version is None:
        return []

    event_timestamp = waiver.signed_at or waiver.created_at or participant.created_at
    if event_timestamp is None:
        return []

    details = []
    if template_version is not None:
        details.append(f"Template v{template_version}")
    if template_id:
        details.append(f"Template ID {template_id}")

    reference_id = str(template_id) if template_id else str(waiver.id)
    return [
        _new_event(
            event_id=f"waiver:{waiver.id}:template-assigned",
            participant_id=participant.id,
            event_type=ParticipantTimelineEventType.WAIVER_TEMPLATE_ASSIGNED,
            event_timestamp=event_timestamp,
            source_system="waiver_templates",
            display_details=_safe_details_text(" | ".join(details)),
            reference_id=reference_id,
        )
    ]


def _build_waiver_signed_event(participant: Participant, waiver: ParticipantWaiver) -> list[_TimelineEvent]:
    signed_event_timestamp = waiver.signed_at or participant.waiver_signed_at
    if signed_event_timestamp is None:
        return []

    return [
        _new_event(
            event_id=f"waiver:{waiver.id}:signed",
            participant_id=participant.id,
            event_type=ParticipantTimelineEventType.WAIVER_SIGNED,
            event_timestamp=signed_event_timestamp,
            source_system="waiver_lifecycle",
            display_details=_safe_details_text(f"Status: {waiver.status}"),
            reference_id=str(waiver.id),
        )
    ]


def _build_pdf_generated_events(participant: Participant, waiver: ParticipantWaiver) -> list[_TimelineEvent]:
    events: list[_TimelineEvent] = []

    for artifact in waiver.pdf_artifacts:
        if artifact.generated_at is None:
            continue

        details = []
        if artifact.template_version is not None:
            details.append(f"Template v{artifact.template_version}")
        if artifact.waiver_revision is not None:
            details.append(f"Revision {artifact.waiver_revision}")

        events.append(
            _new_event(
                event_id=f"pdf:{artifact.id}:generated",
                participant_id=participant.id,
                event_type=ParticipantTimelineEventType.PDF_GENERATED,
                event_timestamp=artifact.generated_at,
                source_system="waiver_pdf_artifacts",
                display_details=_safe_details_text(" | ".join(details)),
                reference_id=str(artifact.id),
            )
        )

    return events


def _build_pdf_verified_events(participant: Participant, waiver: ParticipantWaiver) -> list[_TimelineEvent]:
    events: list[_TimelineEvent] = []

    for audit_event in waiver.audit_events:
        if audit_event.event_type != "PDF_VERIFIED":
            continue
        if audit_event.created_at is None:
            continue

        details = audit_event.details if isinstance(audit_event.details, dict) else {}
        artifact_status = details.get("artifact_status")
        storage_status = details.get("storage_status")
        integrity_status = details.get("integrity_status")
        provenance_status = details.get("provenance_status")
        detail_text = _safe_details_text(
            " | ".join(
                part
                for part in [
                    f"Artifact {artifact_status}" if artifact_status else "",
                    f"Storage {storage_status}" if storage_status else "",
                    f"Integrity {integrity_status}" if integrity_status else "",
                    f"Provenance {provenance_status}" if provenance_status else "",
                ]
                if part
            )
        )

        reference_id = str(details.get("artifact_id") or audit_event.id)
        events.append(
            _new_event(
                event_id=f"waiver-audit:{audit_event.id}:pdf-verified",
                participant_id=participant.id,
                event_type=ParticipantTimelineEventType.PDF_VERIFIED,
                event_timestamp=audit_event.created_at,
                source_system="waiver_audit_events",
                display_details=detail_text,
                reference_id=reference_id,
            )
        )

    return events


def get_participant_timeline_events(db: Session, participant_id: UUID) -> list[ParticipantTimelineEventOut]:
    participant = (
        db.query(Participant)
        .options(
            joinedload(Participant.waiver)
            .joinedload(ParticipantWaiver.audit_events),
            joinedload(Participant.waiver)
            .joinedload(ParticipantWaiver.pdf_artifacts),
        )
        .filter(
            Participant.id == participant_id,
            Participant.removed_at.is_(None),
        )
        .first()
    )

    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found")

    events: list[_TimelineEvent] = []
    events.extend(_build_registration_event(participant))
    events.extend(_build_checkin_event(participant))

    waiver = participant.waiver
    if waiver is not None:
        events.extend(_build_waiver_template_assignment_event(participant, waiver))
        events.extend(_build_waiver_signed_event(participant, waiver))
        events.extend(_build_pdf_generated_events(participant, waiver))
        events.extend(_build_pdf_verified_events(participant, waiver))

    ordered_events = sorted(
        events,
        key=lambda event: (
            event.event_timestamp,
            event.sort_key,
            event.event_id,
        ),
    )
    return [event.to_out() for event in ordered_events]
