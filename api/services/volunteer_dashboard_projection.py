from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
import logging
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from api.models.participants import Participant
from api.models.participant_waivers import ParticipantWaiver
from api.schemas.volunteer_dashboard import (
    VolunteerDashboardProjectionOut,
    VolunteerDashboardSummaryOut,
    VolunteerDashboardVolunteerOut,
    VolunteerOperationalStatus,
)


COMPLIANCE_NOT_TRACKED = "Not Tracked"
WAIVER_VERIFIED = "Verified"
WAIVER_MISSING = "Missing"

logger = logging.getLogger(__name__)


@dataclass
class _StatusInputs:
    has_event: bool
    has_assignment: bool
    waiver_verified: bool
    has_primary_volunteer_type: bool
    checked_in: bool


def _normalize_role(value: str | None) -> str:
    return (value or "").strip().lower()


def _safe_text(value: object, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _event_is_operationally_current(event) -> bool:
    if event is None:
        return False

    normalized_status = str(getattr(event, "status", "") or "").strip().lower()
    if normalized_status in {"archived", "cancelled"}:
        return False

    start_date = getattr(event, "start_date", None)
    if isinstance(start_date, date) and start_date < date.today():
        return False

    return True


def _compute_status(inputs: _StatusInputs) -> tuple[VolunteerOperationalStatus, list[str]]:
    action_required_reasons: list[str] = []
    incomplete_reasons: list[str] = []

    if not inputs.has_event:
        action_required_reasons.append("No current event assigned")
    if not inputs.waiver_verified:
        action_required_reasons.append("Waiver/document not verified")
    if inputs.has_event and not inputs.has_assignment:
        action_required_reasons.append("No current assignment")

    if not inputs.has_primary_volunteer_type:
        incomplete_reasons.append("Primary volunteer role not set")

    # Evaluate full rule set first, then apply deterministic precedence.
    has_action_required = len(action_required_reasons) > 0
    has_incomplete = len(incomplete_reasons) > 0
    is_checked_in = bool(inputs.checked_in)

    if has_action_required:
        return VolunteerOperationalStatus.ACTION_REQUIRED, action_required_reasons + incomplete_reasons
    if has_incomplete:
        return VolunteerOperationalStatus.INCOMPLETE, incomplete_reasons
    if is_checked_in:
        return VolunteerOperationalStatus.CHECKED_IN, []
    return VolunteerOperationalStatus.READY, []


def _build_sort_key(participant: Participant, status: VolunteerOperationalStatus) -> str:
    event_title = str(getattr(getattr(participant, "event", None), "title", "") or "").strip().lower()
    last_name = str(getattr(participant, "last_name", "") or "").strip().lower()
    first_name = str(getattr(participant, "first_name", "") or "").strip().lower()
    email = str(getattr(participant, "email", "") or "").strip().lower()
    return f"{status.value}:{event_title}:{last_name}:{first_name}:{email}:{participant.id}"


def get_volunteer_dashboard_projection(db: Session, event_id: UUID | None = None) -> VolunteerDashboardProjectionOut:
    try:
        participants = (
            db.query(Participant)
            .options(
                joinedload(Participant.event),
                joinedload(Participant.session),
                joinedload(Participant.waiver).joinedload(ParticipantWaiver.verifier),
            )
            .filter(Participant.removed_at.is_(None))
            .all()
        )

        volunteer_rows: list[VolunteerDashboardVolunteerOut] = []

        for participant in participants:
            try:
                if _normalize_role(_safe_text(participant.role)) != "volunteer":
                    continue

                if event_id and participant.event_id != event_id:
                    continue

                event = participant.event
                if not event_id and not _event_is_operationally_current(event):
                    continue

                has_assignment = bool(participant.session_id)
                waiver_verified = bool(participant.waiver_verified)
                has_primary_type = bool(_safe_text(participant.volunteer_type))
                checked_in = bool(participant.checked_in)

                status_inputs = _StatusInputs(
                    has_event=event is not None,
                    has_assignment=has_assignment,
                    waiver_verified=waiver_verified,
                    has_primary_volunteer_type=has_primary_type,
                    checked_in=checked_in,
                )
                computed_status, status_reasons = _compute_status(status_inputs)

                sort_key = _build_sort_key(participant, computed_status)
                full_name = " ".join(
                    [part for part in [_safe_text(participant.first_name), _safe_text(participant.last_name)] if part]
                ).strip() or "Unknown Volunteer"

                volunteer_rows.append(
                    VolunteerDashboardVolunteerOut(
                        participant_id=participant.id,
                        full_name=full_name,
                        email=_safe_text(participant.email),
                        event_id=participant.event_id,
                        event_title=(_safe_text(event.title) if event else None),
                        event_type=(_safe_text(event.event_type) if event else None),
                        session_id=participant.session_id,
                        session_name=(_safe_text(participant.session.name) if participant.session else None),
                        checked_in=checked_in,
                        waiver_verified=waiver_verified,
                        waiver_document_status=WAIVER_VERIFIED if waiver_verified else WAIVER_MISSING,
                        compliance_status=COMPLIANCE_NOT_TRACKED,
                        computed_status=computed_status,
                        status_reasons=status_reasons,
                        sort_key=sort_key,
                    )
                )
            except Exception:
                logger.exception(
                    "Skipping malformed volunteer row in dashboard projection",
                    extra={"participant_id": str(getattr(participant, "id", "unknown"))},
                )
                continue

        volunteer_rows.sort(key=lambda row: (row.sort_key, str(row.participant_id)))

        status_counter = Counter(row.computed_status for row in volunteer_rows)
        summary = VolunteerDashboardSummaryOut(
            total_volunteers=len(volunteer_rows),
            action_required=int(status_counter.get(VolunteerOperationalStatus.ACTION_REQUIRED, 0)),
            incomplete=int(status_counter.get(VolunteerOperationalStatus.INCOMPLETE, 0)),
            checked_in=int(status_counter.get(VolunteerOperationalStatus.CHECKED_IN, 0)),
            ready=int(status_counter.get(VolunteerOperationalStatus.READY, 0)),
        )

        return VolunteerDashboardProjectionOut(
            compliance_tracking_supported=False,
            summary=summary,
            volunteers=volunteer_rows,
        )
    except Exception:
        logger.exception(
            "Volunteer dashboard projection failed; returning empty projection fallback",
            extra={"event_id": str(event_id) if event_id else None},
        )
        return VolunteerDashboardProjectionOut(
            compliance_tracking_supported=False,
            summary=VolunteerDashboardSummaryOut(
                total_volunteers=0,
                action_required=0,
                incomplete=0,
                checked_in=0,
                ready=0,
            ),
            volunteers=[],
        )
