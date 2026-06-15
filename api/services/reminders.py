from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.reminder_audit_events import ReminderAuditEvent
from api.models.reminder_definitions import ReminderDefinition


VALID_TRIGGER_TYPES = {
    ReminderDefinition.TRIGGER_MANUAL,
    ReminderDefinition.TRIGGER_EVENT,
    ReminderDefinition.TRIGGER_SCHEDULED,
}

VALID_NOTIFICATION_CHANNELS = {
    ReminderDefinition.CHANNEL_EMAIL,
    ReminderDefinition.CHANNEL_SMS,
    ReminderDefinition.CHANNEL_PUSH,
}


def _normalize_text(value: str | None, *, fallback: str | None = None) -> str:
    return (value or fallback or "").strip().lower()


def _normalize_channels(values: list[str] | None) -> list[str]:
    channels = sorted(
        {
            (channel or "").strip().lower()
            for channel in (values or [ReminderDefinition.CHANNEL_EMAIL])
            if (channel or "").strip()
        }
    )
    if not channels:
        raise HTTPException(status_code=400, detail="At least one notification channel is required")

    invalid = [channel for channel in channels if channel not in VALID_NOTIFICATION_CHANNELS]
    if invalid:
        raise HTTPException(status_code=400, detail="Invalid notification channel(s): " + ", ".join(invalid))

    return channels


def _normalize_definition_trigger_type(value: str | None) -> str:
    trigger_type = _normalize_text(value, fallback=ReminderDefinition.TRIGGER_MANUAL)
    if trigger_type not in VALID_TRIGGER_TYPES:
        raise HTTPException(status_code=400, detail="Invalid reminder trigger type")
    return trigger_type


def record_reminder_audit_event(
    db: Session,
    *,
    reminder_id: UUID,
    event_type: str,
    actor_user_id: str | None,
    source: str | None = "reminder_api",
    details: dict[str, Any] | None = None,
) -> ReminderAuditEvent:
    event = ReminderAuditEvent(
        reminder_id=reminder_id,
        event_type=event_type.strip().lower(),
        actor_user_id=actor_user_id,
        source=(source or "reminder_api").strip() or "reminder_api",
        details=details,
    )
    db.add(event)
    db.flush()
    return event


def create_reminder_definition(
    db: Session,
    *,
    reminder_key: str,
    name: str,
    target_domain: str,
    trigger_type: str | None,
    trigger_config: dict[str, Any] | None,
    schedule_config: dict[str, Any] | None,
    notification_channels: list[str] | None,
    notification_template_key: str | None,
    actor_user_id: str | None,
) -> ReminderDefinition:
    normalized_key = reminder_key.strip().lower()
    normalized_domain = target_domain.strip().lower()
    normalized_trigger_type = _normalize_definition_trigger_type(trigger_type)
    normalized_channels = _normalize_channels(notification_channels)

    existing = (
        db.query(ReminderDefinition)
        .filter(ReminderDefinition.reminder_key == normalized_key)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Reminder key already exists")

    reminder = ReminderDefinition(
        reminder_key=normalized_key,
        name=name.strip(),
        target_domain=normalized_domain,
        trigger_type=normalized_trigger_type,
        trigger_config=trigger_config,
        schedule_config=schedule_config,
        notification_channels=normalized_channels,
        notification_template_key=(notification_template_key or "").strip() or None,
        is_active=True,
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    db.add(reminder)
    db.flush()

    record_reminder_audit_event(
        db,
        reminder_id=reminder.id,
        event_type="reminder_created",
        actor_user_id=actor_user_id,
        source="admin.reminders.create",
        details={
            "target_domain": reminder.target_domain,
            "trigger_type": reminder.trigger_type,
            "notification_channels": reminder.notification_channels,
            "notification_template_key": reminder.notification_template_key,
        },
    )

    db.commit()
    db.refresh(reminder)
    return reminder


def list_reminder_definitions(
    db: Session,
    *,
    target_domain: str | None = None,
    active_only: bool = False,
) -> list[ReminderDefinition]:
    query = db.query(ReminderDefinition)
    if target_domain:
        query = query.filter(ReminderDefinition.target_domain == target_domain.strip().lower())
    if active_only:
        query = query.filter(ReminderDefinition.is_active.is_(True))
    return query.order_by(ReminderDefinition.created_at.desc()).all()


def update_reminder_definition_active_state(
    db: Session,
    *,
    reminder_id: UUID,
    is_active: bool,
    actor_user_id: str | None,
) -> ReminderDefinition:
    reminder = db.query(ReminderDefinition).filter(ReminderDefinition.id == reminder_id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    previous = reminder.is_active
    reminder.is_active = is_active
    reminder.updated_by_user_id = actor_user_id
    reminder.updated_at = datetime.now(UTC).replace(tzinfo=None)

    record_reminder_audit_event(
        db,
        reminder_id=reminder.id,
        event_type="reminder_active_state_updated",
        actor_user_id=actor_user_id,
        source="admin.reminders.active_state",
        details={"previous_is_active": previous, "new_is_active": is_active},
    )

    db.commit()
    db.refresh(reminder)
    return reminder


def list_reminder_audit_events(
    db: Session,
    *,
    reminder_id: UUID | None = None,
    event_type: str | None = None,
) -> list[ReminderAuditEvent]:
    query = db.query(ReminderAuditEvent)
    if reminder_id:
        query = query.filter(ReminderAuditEvent.reminder_id == reminder_id)
    if event_type:
        query = query.filter(ReminderAuditEvent.event_type == event_type.strip().lower())
    return query.order_by(ReminderAuditEvent.created_at.desc()).all()