from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.communication_deliveries import CommunicationDelivery
from api.models.communication_messages import CommunicationMessage
from api.models.communication_templates import CommunicationTemplate
from api.services.admin_audit import record_admin_audit_event
from api.services.communication_delivery import DeliveryRequest, get_delivery_provider


VALID_CHANNELS = {
    CommunicationTemplate.CHANNEL_EMAIL,
    CommunicationTemplate.CHANNEL_SMS,
}


def _normalize_channel(value: str | None) -> str:
    return (value or CommunicationTemplate.CHANNEL_EMAIL).strip().lower()


def create_template(
    db: Session,
    *,
    template_key: str,
    name: str,
    channel: str,
    subject_template: str | None,
    body_template: str,
    actor_user_id: str | None,
) -> CommunicationTemplate:
    normalized_key = template_key.strip().lower()
    normalized_channel = _normalize_channel(channel)
    if normalized_channel not in VALID_CHANNELS:
        raise HTTPException(status_code=400, detail="Invalid communication channel")

    existing = (
        db.query(CommunicationTemplate)
        .filter(CommunicationTemplate.template_key == normalized_key)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Template key already exists")

    template = CommunicationTemplate(
        template_key=normalized_key,
        name=name.strip(),
        channel=normalized_channel,
        subject_template=(subject_template or "").strip() or None,
        body_template=body_template,
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    db.add(template)
    db.flush()

    record_admin_audit_event(
        db,
        domain="communications",
        action="template_created",
        actor_user_id=actor_user_id,
        target_type="communication_template",
        target_id=str(template.id),
        target_display=template.template_key,
        source="admin.communications.templates.create",
        details={"channel": template.channel},
    )

    db.commit()
    db.refresh(template)
    return template


def list_templates(db: Session, *, channel: str | None = None) -> list[CommunicationTemplate]:
    query = db.query(CommunicationTemplate)
    if channel:
        query = query.filter(CommunicationTemplate.channel == _normalize_channel(channel))
    return query.order_by(CommunicationTemplate.created_at.desc()).all()


def update_template_active_state(
    db: Session,
    *,
    template_id: UUID,
    is_active: bool,
    actor_user_id: str | None,
) -> CommunicationTemplate:
    template = db.query(CommunicationTemplate).filter(CommunicationTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    previous = template.is_active
    template.is_active = is_active
    template.updated_by_user_id = actor_user_id
    template.updated_at = datetime.now(UTC).replace(tzinfo=None)

    record_admin_audit_event(
        db,
        domain="communications",
        action="template_active_state_updated",
        actor_user_id=actor_user_id,
        target_type="communication_template",
        target_id=str(template.id),
        target_display=template.template_key,
        source="admin.communications.templates.active_state",
        details={"previous_is_active": previous, "new_is_active": is_active},
    )

    db.commit()
    db.refresh(template)
    return template


def create_message(
    db: Session,
    *,
    template_id: UUID | None,
    channel: str,
    audience_type: str,
    audience_filter: dict[str, Any] | None,
    subject: str | None,
    body: str,
    actor_user_id: str | None,
) -> CommunicationMessage:
    normalized_channel = _normalize_channel(channel)
    if normalized_channel not in VALID_CHANNELS:
        raise HTTPException(status_code=400, detail="Invalid communication channel")

    template: CommunicationTemplate | None = None
    if template_id:
        template = db.query(CommunicationTemplate).filter(CommunicationTemplate.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        if template.channel != normalized_channel:
            raise HTTPException(status_code=400, detail="Template channel mismatch")

    message = CommunicationMessage(
        template_id=template_id,
        channel=normalized_channel,
        audience_type=(audience_type or "manual").strip().lower() or "manual",
        audience_filter=audience_filter,
        subject=(subject or "").strip() or None,
        body=body,
        status=CommunicationMessage.STATUS_READY,
        created_by_user_id=actor_user_id,
    )
    db.add(message)
    db.flush()

    record_admin_audit_event(
        db,
        domain="communications",
        action="message_created",
        actor_user_id=actor_user_id,
        target_type="communication_message",
        target_id=str(message.id),
        source="admin.communications.messages.create",
        details={
            "channel": message.channel,
            "audience_type": message.audience_type,
            "template_id": str(template.id) if template else None,
        },
    )

    db.commit()
    db.refresh(message)
    return message


def list_messages(db: Session, *, channel: str | None = None) -> list[CommunicationMessage]:
    query = db.query(CommunicationMessage)
    if channel:
        query = query.filter(CommunicationMessage.channel == _normalize_channel(channel))
    return query.order_by(CommunicationMessage.created_at.desc()).all()


def deliver_message_to_recipient(
    db: Session,
    *,
    message_id: UUID,
    recipient: str,
    provider_key: str,
    actor_user_id: str | None,
) -> CommunicationDelivery:
    message = db.query(CommunicationMessage).filter(CommunicationMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.status not in {CommunicationMessage.STATUS_READY, CommunicationMessage.STATUS_DISPATCHED}:
        raise HTTPException(status_code=409, detail="Message is not ready for delivery")

    provider = get_delivery_provider(provider_key)
    request = DeliveryRequest(
        channel=message.channel,
        recipient=recipient.strip(),
        subject=message.subject,
        body=message.body,
    )
    result = provider.send(request)

    now = datetime.now(UTC).replace(tzinfo=None)
    delivery = CommunicationDelivery(
        message_id=message.id,
        channel=message.channel,
        recipient=request.recipient,
        provider_key=provider.key,
        provider_message_id=result.provider_message_id,
        status=(result.status or CommunicationDelivery.STATUS_FAILED).strip().lower(),
        error_message=result.error_message,
        metadata_json=result.metadata,
        created_by_user_id=actor_user_id,
        completed_at=now,
    )
    db.add(delivery)

    message.status = CommunicationMessage.STATUS_DISPATCHED
    message.updated_at = now

    record_admin_audit_event(
        db,
        domain="communications",
        action="message_delivery_requested",
        actor_user_id=actor_user_id,
        target_type="communication_delivery",
        target_display=request.recipient,
        source="admin.communications.deliveries.create",
        details={
            "message_id": str(message.id),
            "provider_key": provider.key,
            "delivery_status": delivery.status,
        },
    )

    db.commit()
    db.refresh(delivery)
    return delivery


def list_deliveries(
    db: Session,
    *,
    message_id: UUID | None = None,
    status: str | None = None,
) -> list[CommunicationDelivery]:
    query = db.query(CommunicationDelivery)
    if message_id:
        query = query.filter(CommunicationDelivery.message_id == message_id)
    if status:
        query = query.filter(CommunicationDelivery.status == status.strip().lower())
    return query.order_by(CommunicationDelivery.created_at.desc()).all()