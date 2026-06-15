from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.notification_delivery_attempts import NotificationDeliveryAttempt
from api.models.notification_delivery_events import NotificationDeliveryEvent
from api.services.notification_delivery import (
    NotificationRequest,
    get_notification_provider,
)


DEFAULT_DELIVERY_MAX_ATTEMPTS = 3
DEFAULT_DELIVERY_RETRY_DELAY_SECONDS = 60
MAX_DELIVERY_RETRY_DELAY_SECONDS = 5 * 60


@dataclass
class DeliveryQueueRequest:
    delivery_key: str
    source_domain: str
    channel: str
    recipient: str
    delivery_payload: dict[str, Any]
    source_id: str | None = None
    execution_queue_item_id: str | None = None
    provider_key: str = "noop"
    scheduled_for: datetime | None = None
    max_attempts: int = DEFAULT_DELIVERY_MAX_ATTEMPTS
    actor_user_id: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass
class DeliveryBatchResult:
    processed_count: int
    succeeded_count: int
    failed_count: int
    retry_scheduled_count: int
    skipped_count: int


def _now_utc_naive(value: datetime | None = None) -> datetime:
    if value is None:
        return datetime.now(UTC).replace(tzinfo=None)
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


def _default_retry_delay_seconds(attempt_count: int) -> int:
    delay = DEFAULT_DELIVERY_RETRY_DELAY_SECONDS * max(attempt_count, 1)
    return min(delay, MAX_DELIVERY_RETRY_DELAY_SECONDS)


def _normalize_source_domain(value: str | None) -> str:
    return (value or "unknown").strip().lower()


def _normalize_channel(value: str | None) -> str:
    return (value or "").strip().lower()


def record_delivery_event(
    db: Session,
    *,
    delivery_attempt_id: UUID,
    event_type: str,
    source: str | None = "notification_pipeline",
    details: dict[str, Any] | None = None,
) -> NotificationDeliveryEvent:
    event = NotificationDeliveryEvent(
        delivery_attempt_id=delivery_attempt_id,
        event_type=event_type.strip().lower(),
        source=(source or "notification_pipeline").strip() or "notification_pipeline",
        details=details,
    )
    db.add(event)
    db.flush()
    return event


def queue_notification_delivery(
    db: Session,
    request: DeliveryQueueRequest,
) -> NotificationDeliveryAttempt:
    normalized_key = (request.delivery_key or "").strip()
    if not normalized_key:
        raise HTTPException(status_code=400, detail="delivery_key is required")

    normalized_channel = _normalize_channel(request.channel)
    if not normalized_channel:
        raise HTTPException(status_code=400, detail="channel is required")

    normalized_recipient = (request.recipient or "").strip()
    if not normalized_recipient:
        raise HTTPException(status_code=400, detail="recipient is required")

    existing = (
        db.query(NotificationDeliveryAttempt)
        .filter(NotificationDeliveryAttempt.delivery_key == normalized_key)
        .first()
    )
    if existing:
        record_delivery_event(
            db,
            delivery_attempt_id=existing.id,
            event_type="delivery_duplicate_suppressed",
            source="notification_pipeline.queue",
            details={
                "delivery_key": normalized_key,
                "existing_status": existing.status,
            },
        )
        db.commit()
        db.refresh(existing)
        return existing

    execution_queue_item_id = None
    if request.execution_queue_item_id:
        try:
            execution_queue_item_id = UUID(str(request.execution_queue_item_id))
        except (ValueError, AttributeError):
            execution_queue_item_id = None

    attempt = NotificationDeliveryAttempt(
        delivery_key=normalized_key,
        source_domain=_normalize_source_domain(request.source_domain),
        source_id=(request.source_id or "").strip() or None,
        execution_queue_item_id=execution_queue_item_id,
        channel=normalized_channel,
        recipient=normalized_recipient,
        provider_key=(request.provider_key or "noop").strip().lower() or "noop",
        status=NotificationDeliveryAttempt.STATUS_PENDING,
        attempt_count=0,
        max_attempts=max(request.max_attempts, 1),
        scheduled_for=_now_utc_naive(request.scheduled_for) if request.scheduled_for else None,
        delivery_payload=request.delivery_payload,
        delivery_metadata=request.metadata,
        created_by_user_id=request.actor_user_id,
    )
    db.add(attempt)
    db.flush()

    record_delivery_event(
        db,
        delivery_attempt_id=attempt.id,
        event_type="delivery_queued",
        source="notification_pipeline.queue",
        details={
            "delivery_key": normalized_key,
            "source_domain": attempt.source_domain,
            "channel": attempt.channel,
            "provider_key": attempt.provider_key,
            "scheduled_for": attempt.scheduled_for.isoformat() if attempt.scheduled_for else None,
        },
    )

    db.commit()
    db.refresh(attempt)
    return attempt


def _load_attempt(db: Session, attempt_id: UUID) -> NotificationDeliveryAttempt:
    attempt = (
        db.query(NotificationDeliveryAttempt)
        .filter(NotificationDeliveryAttempt.id == attempt_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Notification delivery attempt not found")
    return attempt


def process_delivery_attempt(
    db: Session,
    *,
    attempt_id: UUID,
    actor_user_id: str | None,
    source: str = "notification_pipeline.processor",
) -> NotificationDeliveryAttempt:
    attempt = _load_attempt(db, attempt_id)
    now = _now_utc_naive()

    if attempt.status not in {
        NotificationDeliveryAttempt.STATUS_PENDING,
        NotificationDeliveryAttempt.STATUS_SCHEDULED,
        NotificationDeliveryAttempt.STATUS_RETRY_PENDING,
    }:
        raise HTTPException(
            status_code=409,
            detail=f"Delivery attempt is not processable in status: {attempt.status}",
        )

    if attempt.scheduled_for and now < attempt.scheduled_for:
        record_delivery_event(
            db,
            delivery_attempt_id=attempt.id,
            event_type="delivery_not_due",
            source=source,
            details={
                "delivery_key": attempt.delivery_key,
                "scheduled_for": attempt.scheduled_for.isoformat(),
                "current_time": now.isoformat(),
            },
        )
        db.commit()
        db.refresh(attempt)
        return attempt

    attempt.status = NotificationDeliveryAttempt.STATUS_PROCESSING
    attempt.attempt_count = (attempt.attempt_count or 0) + 1

    record_delivery_event(
        db,
        delivery_attempt_id=attempt.id,
        event_type="delivery_started",
        source=source,
        details={
            "delivery_key": attempt.delivery_key,
            "attempt_count": attempt.attempt_count,
            "channel": attempt.channel,
            "provider_key": attempt.provider_key,
        },
    )
    db.flush()

    provider = get_notification_provider(attempt.provider_key)
    payload = attempt.delivery_payload or {}

    notification_request = NotificationRequest(
        channel=attempt.channel,
        recipient=attempt.recipient,
        subject=payload.get("subject"),
        body=payload.get("body", ""),
        context=payload.get("context"),
    )

    try:
        result = provider.send(notification_request)
    except Exception as exc:
        return _record_delivery_failure(
            db,
            attempt=attempt,
            error_message=str(exc),
            actor_user_id=actor_user_id,
            source=source,
            now=now,
        )

    if result.status in {"accepted", "delivered", "sent"}:
        attempt.status = NotificationDeliveryAttempt.STATUS_DELIVERED
        attempt.delivered_at = now
        attempt.provider_message_id = result.provider_message_id
        attempt.delivery_metadata = {
            **(attempt.delivery_metadata or {}),
            "provider_response": result.metadata,
        }
        attempt.failure_reason = None
        attempt.next_retry_at = None

        record_delivery_event(
            db,
            delivery_attempt_id=attempt.id,
            event_type="delivery_succeeded",
            source=source,
            details={
                "delivery_key": attempt.delivery_key,
                "attempt_count": attempt.attempt_count,
                "provider_message_id": result.provider_message_id,
            },
        )
    else:
        return _record_delivery_failure(
            db,
            attempt=attempt,
            error_message=result.error_message or f"Provider returned status: {result.status}",
            actor_user_id=actor_user_id,
            source=source,
            now=now,
        )

    db.commit()
    db.refresh(attempt)
    return attempt


def _record_delivery_failure(
    db: Session,
    *,
    attempt: NotificationDeliveryAttempt,
    error_message: str,
    actor_user_id: str | None,
    source: str,
    now: datetime,
) -> NotificationDeliveryAttempt:
    normalized_error = (error_message or "Delivery failed").strip()
    attempt.failure_reason = normalized_error

    if (attempt.attempt_count or 0) < (attempt.max_attempts or DEFAULT_DELIVERY_MAX_ATTEMPTS):
        retry_delay = _default_retry_delay_seconds(attempt.attempt_count or 1)
        attempt.status = NotificationDeliveryAttempt.STATUS_RETRY_PENDING
        attempt.next_retry_at = now + timedelta(seconds=retry_delay)

        record_delivery_event(
            db,
            delivery_attempt_id=attempt.id,
            event_type="delivery_retry_scheduled",
            source=source,
            details={
                "delivery_key": attempt.delivery_key,
                "attempt_count": attempt.attempt_count,
                "retry_after_seconds": retry_delay,
                "next_retry_at": attempt.next_retry_at.isoformat(),
                "error_message": normalized_error,
            },
        )
    else:
        attempt.status = NotificationDeliveryAttempt.STATUS_FAILED
        attempt.next_retry_at = None

        record_delivery_event(
            db,
            delivery_attempt_id=attempt.id,
            event_type="delivery_failed",
            source=source,
            details={
                "delivery_key": attempt.delivery_key,
                "attempt_count": attempt.attempt_count,
                "error_message": normalized_error,
            },
        )

    db.commit()
    db.refresh(attempt)
    return attempt


def cancel_delivery_attempt(
    db: Session,
    *,
    attempt_id: UUID,
    reason: str | None,
    actor_user_id: str | None,
    source: str = "notification_pipeline.cancel",
) -> NotificationDeliveryAttempt:
    attempt = _load_attempt(db, attempt_id)

    if attempt.status in {
        NotificationDeliveryAttempt.STATUS_DELIVERED,
        NotificationDeliveryAttempt.STATUS_FAILED,
        NotificationDeliveryAttempt.STATUS_CANCELLED,
    }:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel a delivery attempt in terminal status: {attempt.status}",
        )

    attempt.status = NotificationDeliveryAttempt.STATUS_CANCELLED
    attempt.failure_reason = (reason or "Cancelled").strip() or "Cancelled"
    attempt.next_retry_at = None

    record_delivery_event(
        db,
        delivery_attempt_id=attempt.id,
        event_type="delivery_cancelled",
        source=source,
        details={
            "delivery_key": attempt.delivery_key,
            "reason": attempt.failure_reason,
        },
    )

    db.commit()
    db.refresh(attempt)
    return attempt


def list_delivery_attempts(
    db: Session,
    *,
    source_domain: str | None = None,
    source_id: str | None = None,
    channel: str | None = None,
    status: str | None = None,
    execution_queue_item_id: UUID | None = None,
    limit: int = 50,
) -> list[NotificationDeliveryAttempt]:
    query = db.query(NotificationDeliveryAttempt)
    if source_domain:
        query = query.filter(
            NotificationDeliveryAttempt.source_domain == source_domain.strip().lower()
        )
    if source_id:
        query = query.filter(NotificationDeliveryAttempt.source_id == source_id.strip())
    if channel:
        query = query.filter(
            NotificationDeliveryAttempt.channel == channel.strip().lower()
        )
    if status:
        query = query.filter(
            NotificationDeliveryAttempt.status == status.strip().lower()
        )
    if execution_queue_item_id:
        query = query.filter(
            NotificationDeliveryAttempt.execution_queue_item_id == execution_queue_item_id
        )
    return (
        query.order_by(NotificationDeliveryAttempt.created_at.desc())
        .limit(limit)
        .all()
    )


def list_delivery_events(
    db: Session,
    *,
    attempt_id: UUID,
) -> list[NotificationDeliveryEvent]:
    return (
        db.query(NotificationDeliveryEvent)
        .filter(NotificationDeliveryEvent.delivery_attempt_id == attempt_id)
        .order_by(NotificationDeliveryEvent.created_at.asc())
        .all()
    )


def process_due_deliveries(
    db: Session,
    *,
    now: datetime | None = None,
    source_domain: str | None = None,
    channel: str | None = None,
    actor_user_id: str | None = None,
    limit: int = 100,
) -> DeliveryBatchResult:
    evaluation_time = _now_utc_naive(now)

    from sqlalchemy import or_

    query = db.query(NotificationDeliveryAttempt).filter(
        NotificationDeliveryAttempt.status.in_([
            NotificationDeliveryAttempt.STATUS_PENDING,
            NotificationDeliveryAttempt.STATUS_SCHEDULED,
            NotificationDeliveryAttempt.STATUS_RETRY_PENDING,
        ])
    )

    if source_domain:
        query = query.filter(
            NotificationDeliveryAttempt.source_domain == source_domain.strip().lower()
        )
    if channel:
        query = query.filter(
            NotificationDeliveryAttempt.channel == channel.strip().lower()
        )

    query = query.filter(
        or_(
            NotificationDeliveryAttempt.scheduled_for.is_(None),
            NotificationDeliveryAttempt.scheduled_for <= evaluation_time,
        )
    ).order_by(NotificationDeliveryAttempt.created_at.asc()).limit(limit)

    candidates = query.all()

    succeeded = 0
    failed = 0
    retry_scheduled = 0
    skipped = 0

    for attempt in candidates:
        result_attempt = process_delivery_attempt(
            db,
            attempt_id=attempt.id,
            actor_user_id=actor_user_id,
        )
        if result_attempt.status == NotificationDeliveryAttempt.STATUS_DELIVERED:
            succeeded += 1
        elif result_attempt.status == NotificationDeliveryAttempt.STATUS_FAILED:
            failed += 1
        elif result_attempt.status == NotificationDeliveryAttempt.STATUS_RETRY_PENDING:
            retry_scheduled += 1
        else:
            skipped += 1

    return DeliveryBatchResult(
        processed_count=len(candidates),
        succeeded_count=succeeded,
        failed_count=failed,
        retry_scheduled_count=retry_scheduled,
        skipped_count=skipped,
    )
