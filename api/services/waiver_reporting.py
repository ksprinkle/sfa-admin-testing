from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from api.models.participants import Participant
from api.models.participant_waivers import ParticipantWaiver
from api.models.waiver_audit_events import WaiverAuditEvent
from api.models.waiver_deliveries import WaiverDelivery
from api.models.waiver_signing_tokens import WaiverSigningToken
from api.services.waiver_lifecycle import canonicalize_waiver_status


@dataclass
class WaiverDashboardMetrics:
    total_participants: int
    waivers_required: int
    waivers_sent: int
    waivers_viewed: int
    waivers_signed: int
    expired_links: int
    email_deliveries: int
    sms_deliveries: int
    failed_deliveries: int
    completion_rate: float


def _apply_active_participant_filters(query, event_id=None):
    query = query.filter(
        Participant.removed_at.is_(None),
        func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
    )
    if event_id is not None:
        query = query.filter(Participant.event_id == event_id)
    return query


def get_dashboard_metrics(db: Session, *, event_id=None) -> WaiverDashboardMetrics:
    total_participants = (
        _apply_active_participant_filters(
            db.query(func.count(Participant.id)),
            event_id=event_id,
        )
        .scalar()
        or 0
    )

    waiver_rows = (
        _apply_active_participant_filters(
            db.query(
                ParticipantWaiver.status.label("waiver_status"),
                Participant.waiver_verified.label("waiver_verified"),
            ).outerjoin(ParticipantWaiver, ParticipantWaiver.participant_id == Participant.id),
            event_id=event_id,
        )
        .all()
    )

    waivers_sent = 0
    waivers_viewed = 0
    waivers_signed = 0

    for row in waiver_rows:
        status = canonicalize_waiver_status(getattr(row, "waiver_status", None))
        verified = bool(getattr(row, "waiver_verified", False))

        if status in {ParticipantWaiver.STATUS_SENT, ParticipantWaiver.STATUS_VIEWED, ParticipantWaiver.STATUS_SIGNED}:
            waivers_sent += 1
        if status in {ParticipantWaiver.STATUS_VIEWED, ParticipantWaiver.STATUS_SIGNED}:
            waivers_viewed += 1
        if status == ParticipantWaiver.STATUS_SIGNED or verified:
            waivers_signed += 1

    expired_links = (
        _apply_active_participant_filters(
            db.query(func.count(WaiverSigningToken.id))
            .join(ParticipantWaiver, ParticipantWaiver.id == WaiverSigningToken.waiver_id)
            .join(Participant, Participant.id == ParticipantWaiver.participant_id)
            .filter(WaiverSigningToken.status == WaiverSigningToken.STATUS_EXPIRED),
            event_id=event_id,
        )
        .scalar()
        or 0
    )

    delivery_rows = (
        _apply_active_participant_filters(
            db.query(
                WaiverDelivery.method.label("method"),
                WaiverDelivery.status.label("status"),
            )
            .join(Participant, Participant.id == WaiverDelivery.participant_id),
            event_id=event_id,
        )
        .all()
    )

    email_deliveries = 0
    sms_deliveries = 0
    failed_deliveries = 0
    for row in delivery_rows:
        method = (getattr(row, "method", "") or "").strip().lower()
        status = (getattr(row, "status", "") or "").strip().lower()

        if method == WaiverDelivery.METHOD_EMAIL and status == WaiverDelivery.STATUS_COMPLETED:
            email_deliveries += 1
        if method == WaiverDelivery.METHOD_SMS and status == WaiverDelivery.STATUS_COMPLETED:
            sms_deliveries += 1
        if status == WaiverDelivery.STATUS_FAILED:
            failed_deliveries += 1

    completion_rate = round((waivers_signed / total_participants) * 100, 2) if total_participants > 0 else 0.0

    return WaiverDashboardMetrics(
        total_participants=int(total_participants),
        waivers_required=int(total_participants),
        waivers_sent=int(waivers_sent),
        waivers_viewed=int(waivers_viewed),
        waivers_signed=int(waivers_signed),
        expired_links=int(expired_links),
        email_deliveries=int(email_deliveries),
        sms_deliveries=int(sms_deliveries),
        failed_deliveries=int(failed_deliveries),
        completion_rate=float(completion_rate),
    )


def get_delivery_rows_for_export(db: Session, *, event_id=None):
    query = (
        db.query(
            WaiverDelivery.id,
            WaiverDelivery.waiver_id,
            WaiverDelivery.participant_id,
            WaiverDelivery.method,
            WaiverDelivery.recipient,
            WaiverDelivery.status,
            WaiverDelivery.attempt_number,
            WaiverDelivery.template_key,
            WaiverDelivery.provider_message_id,
            WaiverDelivery.error_message,
            WaiverDelivery.signing_path,
            WaiverDelivery.token_expires_at,
            WaiverDelivery.completed_at,
            WaiverDelivery.created_at,
            Participant.event_id,
            Participant.first_name,
            Participant.last_name,
            Participant.email,
        )
        .join(Participant, Participant.id == WaiverDelivery.participant_id)
        .filter(Participant.removed_at.is_(None))
    )

    if event_id is not None:
        query = query.filter(Participant.event_id == event_id)

    return query.order_by(WaiverDelivery.created_at.desc(), WaiverDelivery.attempt_number.desc()).all()


def get_analytics_event_rows(db: Session, *, event_id=None, days: int = 30):
    days = max(1, min(365, int(days)))
    cutoff = datetime.utcnow() - timedelta(days=days)

    date_expr = func.date(WaiverAuditEvent.created_at)
    query = (
        db.query(
            date_expr.label("event_date"),
            WaiverAuditEvent.event_type.label("event_type"),
            func.count(WaiverAuditEvent.id).label("count"),
        )
        .join(ParticipantWaiver, ParticipantWaiver.id == WaiverAuditEvent.waiver_id)
        .join(Participant, Participant.id == ParticipantWaiver.participant_id)
        .filter(
            Participant.removed_at.is_(None),
            WaiverAuditEvent.created_at >= cutoff,
        )
    )

    if event_id is not None:
        query = query.filter(Participant.event_id == event_id)

    return (
        query.group_by(date_expr, WaiverAuditEvent.event_type)
        .order_by(date_expr.desc(), WaiverAuditEvent.event_type.asc())
        .all()
    )
