from __future__ import annotations

from datetime import datetime
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from api.models.participants import Participant
from api.models.participant_waivers import ParticipantWaiver
from api.models.waiver_deliveries import WaiverDelivery
from api.services.waiver_lifecycle import record_waiver_audit_event
from api.services.waiver_signing import create_signing_token


PUBLIC_SIGNING_SOURCE = "waiver_delivery_service"


class _SafeTemplateDict(dict):
    def __missing__(self, key):
        return "{" + str(key) + "}"


EMAIL_DEFAULT_SUBJECT = "Complete your Surfers For Autism waiver"
EMAIL_DEFAULT_BODY = (
    "Hello {participant_first_name},\n\n"
    "Please complete your waiver using this secure link:\n"
    "{signing_url}\n\n"
    "This link expires at {token_expires_at}.\n"
)
SMS_DEFAULT_BODY = (
    "SFA waiver link: {signing_url} "
    "(expires {token_expires_at})"
)


def _utcnow() -> datetime:
    return datetime.utcnow()


def _normalize_delivery_method(method: str) -> str:
    value = (method or "").strip().lower()
    if value not in {WaiverDelivery.METHOD_EMAIL, WaiverDelivery.METHOD_SMS}:
        raise HTTPException(status_code=400, detail="Unsupported delivery method")
    return value


def _resolve_signing_origin() -> str:
    # Keep deterministic until environment-level public URL config is added.
    return "https://sfa-admin-testing.onrender.com"


def _build_signing_url(signing_path: str) -> str:
    return _resolve_signing_origin().rstrip("/") + signing_path


def _render_templates(
    *,
    method: str,
    template_key: str,
    subject_template: str | None,
    body_template: str | None,
    context: dict[str, str],
) -> tuple[str | None, str]:
    template_name = (template_key or "default").strip() or "default"

    if method == WaiverDelivery.METHOD_EMAIL:
        subject = (subject_template or EMAIL_DEFAULT_SUBJECT).format_map(_SafeTemplateDict(context))
        body = (body_template or EMAIL_DEFAULT_BODY).format_map(_SafeTemplateDict(context))
        return subject, body

    body = (body_template or SMS_DEFAULT_BODY).format_map(_SafeTemplateDict(context))
    return None, body


def _simulate_provider_send(*, method: str, recipient: str) -> tuple[str, str | None]:
    # Deterministic simulation for phase scope; production providers are future work.
    if "fail" in (recipient or "").lower():
        return "failed", None

    prefix = "email" if method == WaiverDelivery.METHOD_EMAIL else "sms"
    return "sent", f"{prefix}-{uuid.uuid4()}"


def get_waiver_for_delivery(db: Session, waiver_id) -> ParticipantWaiver:
    waiver = (
        db.query(ParticipantWaiver)
        .options(
            joinedload(ParticipantWaiver.participant).joinedload(Participant.event),
        )
        .filter(ParticipantWaiver.id == waiver_id)
        .first()
    )
    if waiver is None:
        raise HTTPException(status_code=404, detail="Waiver not found")
    if waiver.participant is None:
        raise HTTPException(status_code=404, detail="Participant for waiver not found")
    return waiver


def create_delivery_attempt(
    db: Session,
    *,
    waiver: ParticipantWaiver,
    method: str,
    recipient: str,
    expires_in_minutes: int,
    template_key: str,
    subject_template: str | None,
    body_template: str | None,
    actor_user_id: str | None,
    resend_of: WaiverDelivery | None = None,
    resend_reason: str | None = None,
) -> WaiverDelivery:
    method = _normalize_delivery_method(method)
    clean_recipient = (recipient or "").strip()
    if not clean_recipient:
        raise HTTPException(status_code=400, detail="Delivery recipient is required")

    if waiver.participant and waiver.participant.waiver_verified:
        raise HTTPException(status_code=409, detail="Waiver already signed; delivery not required")

    participant = waiver.participant
    token_record, raw_token = create_signing_token(
        db,
        participant=participant,
        expires_in_minutes=expires_in_minutes,
        actor_user_id=actor_user_id,
        waiver_version=waiver.waiver_version,
        note=waiver.notes,
    )

    signing_path = f"/api/waivers/sign/{raw_token}"
    signing_url = _build_signing_url(signing_path)
    token_expiry_label = token_record.expires_at.isoformat()

    context = {
        "participant_first_name": participant.first_name,
        "participant_last_name": participant.last_name,
        "participant_email": participant.email,
        "event_title": participant.event.title if participant.event else "Surfers For Autism Event",
        "signing_url": signing_url,
        "signing_path": signing_path,
        "token_expires_at": token_expiry_label,
        "waiver_version": waiver.waiver_version or "unspecified",
    }

    rendered_subject, rendered_body = _render_templates(
        method=method,
        template_key=template_key,
        subject_template=subject_template,
        body_template=body_template,
        context=context,
    )

    prior_attempt = resend_of.attempt_number if resend_of is not None else 0
    attempt_number = max(1, prior_attempt + 1)

    delivery = WaiverDelivery(
        waiver_id=waiver.id,
        participant_id=waiver.participant_id,
        resend_of_delivery_id=resend_of.id if resend_of is not None else None,
        method=method,
        recipient=clean_recipient,
        status=WaiverDelivery.STATUS_CREATED,
        attempt_number=attempt_number,
        template_key=(template_key or "default").strip() or "default",
        rendered_subject=rendered_subject,
        rendered_body=rendered_body,
        signing_path=signing_path,
        token_expires_at=token_record.expires_at,
        created_by_user_id=actor_user_id,
        delivery_metadata={
            "resend_reason": (resend_reason or "").strip() or None,
            "token_status": token_record.status,
        },
    )
    db.add(delivery)
    db.flush()

    record_waiver_audit_event(
        db,
        waiver,
        event_type="DELIVERY_CREATED",
        actor_user_id=actor_user_id,
        source=PUBLIC_SIGNING_SOURCE,
        details={
            "delivery_id": str(delivery.id),
            "method": method,
            "recipient": clean_recipient,
            "attempt_number": attempt_number,
            "template_key": delivery.template_key,
        },
    )

    if resend_of is not None:
        record_waiver_audit_event(
            db,
            waiver,
            event_type="DELIVERY_RETRIED",
            actor_user_id=actor_user_id,
            source=PUBLIC_SIGNING_SOURCE,
            details={
                "delivery_id": str(delivery.id),
                "resend_of_delivery_id": str(resend_of.id),
                "reason": (resend_reason or "").strip() or None,
            },
        )

    provider_status, provider_message_id = _simulate_provider_send(method=method, recipient=clean_recipient)
    now = _utcnow()

    if provider_status == "failed":
        delivery.status = WaiverDelivery.STATUS_FAILED
        delivery.error_message = "Provider send simulation failed for recipient"
        delivery.completed_at = now

        record_waiver_audit_event(
            db,
            waiver,
            event_type="DELIVERY_FAILED",
            actor_user_id=actor_user_id,
            source=PUBLIC_SIGNING_SOURCE,
            details={
                "delivery_id": str(delivery.id),
                "method": method,
                "recipient": clean_recipient,
            },
        )
        return delivery

    delivery.provider_message_id = provider_message_id
    delivery.status = WaiverDelivery.STATUS_SENT
    delivery.completed_at = now

    sent_event_type = "EMAIL_SENT" if method == WaiverDelivery.METHOD_EMAIL else "SMS_SENT"
    record_waiver_audit_event(
        db,
        waiver,
        event_type=sent_event_type,
        actor_user_id=actor_user_id,
        source=PUBLIC_SIGNING_SOURCE,
        details={
            "delivery_id": str(delivery.id),
            "provider_message_id": provider_message_id,
            "recipient": clean_recipient,
        },
    )

    delivery.status = WaiverDelivery.STATUS_COMPLETED
    record_waiver_audit_event(
        db,
        waiver,
        event_type="DELIVERY_COMPLETED",
        actor_user_id=actor_user_id,
        source=PUBLIC_SIGNING_SOURCE,
        details={
            "delivery_id": str(delivery.id),
            "provider_message_id": provider_message_id,
            "method": method,
        },
    )

    return delivery


def get_delivery_for_waiver(db: Session, *, waiver_id, delivery_id) -> WaiverDelivery:
    delivery = (
        db.query(WaiverDelivery)
        .filter(
            WaiverDelivery.id == delivery_id,
            WaiverDelivery.waiver_id == waiver_id,
        )
        .first()
    )
    if delivery is None:
        raise HTTPException(status_code=404, detail="Waiver delivery not found")
    return delivery


def list_deliveries_for_waiver(db: Session, *, waiver_id) -> list[WaiverDelivery]:
    return (
        db.query(WaiverDelivery)
        .filter(WaiverDelivery.waiver_id == waiver_id)
        .order_by(WaiverDelivery.created_at.desc(), WaiverDelivery.attempt_number.desc())
        .all()
    )
