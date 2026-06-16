from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Callable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.reminder_definitions import ReminderDefinition
from api.models.reminder_execution_queue import ReminderExecutionQueueItem
from api.services.reminders import record_reminder_audit_event


DEFAULT_REMINDER_MAX_ATTEMPTS = 3
DEFAULT_REMINDER_RETRY_DELAY_SECONDS = 60
MAX_REMINDER_RETRY_DELAY_SECONDS = 5 * 60


@dataclass
class ReminderExecutionEvaluation:
    reminder_id: str
    reminder_key: str
    trigger_source: str
    execution_key: str
    is_eligible: bool
    status: str
    reason: str
    scheduled_for: datetime | None = None
    payload: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


@dataclass
class ReminderExecutionBatchResult:
    evaluated_count: int
    queued_count: int
    skipped_count: int
    duplicate_count: int
    queued_items: list[ReminderExecutionQueueItem]
    evaluations: list[ReminderExecutionEvaluation]


@dataclass
class ReminderPipelineContext:
    now: datetime
    execution_context: dict[str, Any]
    actor_user_id: str | None
    source: str


@dataclass
class ReminderDispatchOutcome:
    succeeded: bool
    result: dict[str, Any] | None = None
    error_message: str | None = None
    retry_after_seconds: int | None = None


DispatchCallback = Callable[[ReminderExecutionQueueItem], ReminderDispatchOutcome]


def _normalize_text(value: str | None, *, fallback: str | None = None) -> str:
    return (value or fallback or "").strip().lower()


def _now_utc_naive(value: datetime | None = None) -> datetime:
    if value is None:
        return datetime.now(UTC).replace(tzinfo=None)
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return _now_utc_naive(value)
    if isinstance(value, str):
        candidate = value.strip().replace("Z", "+00:00")
        if not candidate:
            return None
        try:
            return _now_utc_naive(datetime.fromisoformat(candidate))
        except ValueError:
            return None
    return None


def _read_schedule_datetime(reminder: ReminderDefinition, execution_context: dict[str, Any]) -> datetime | None:
    schedule_config = reminder.schedule_config or {}
    trigger_config = reminder.trigger_config or {}
    for candidate in (
        execution_context.get("scheduled_for"),
        execution_context.get("execute_at"),
        schedule_config.get("scheduled_for"),
        schedule_config.get("execute_at"),
        schedule_config.get("run_at"),
        trigger_config.get("scheduled_for"),
        trigger_config.get("execute_at"),
    ):
        parsed = _parse_datetime(candidate)
        if parsed:
            return parsed
    return None


def _read_expiration_datetime(reminder: ReminderDefinition, execution_context: dict[str, Any]) -> datetime | None:
    schedule_config = reminder.schedule_config or {}
    trigger_config = reminder.trigger_config or {}
    for candidate in (
        execution_context.get("expires_at"),
        schedule_config.get("expires_at"),
        trigger_config.get("expires_at"),
    ):
        parsed = _parse_datetime(candidate)
        if parsed:
            return parsed
    return None


def _read_start_datetime(reminder: ReminderDefinition, execution_context: dict[str, Any]) -> datetime | None:
    schedule_config = reminder.schedule_config or {}
    trigger_config = reminder.trigger_config or {}
    for candidate in (
        execution_context.get("start_at"),
        schedule_config.get("start_at"),
        trigger_config.get("start_at"),
    ):
        parsed = _parse_datetime(candidate)
        if parsed:
            return parsed
    return None


def _build_execution_key(
    reminder: ReminderDefinition,
    *,
    trigger_source: str,
    scheduled_for: datetime | None,
    execution_context: dict[str, Any],
) -> str:
    schedule_config = reminder.schedule_config or {}
    trigger_config = reminder.trigger_config or {}
    explicit_key = (
        execution_context.get("execution_key")
        or execution_context.get("run_key")
        or schedule_config.get("execution_key")
        or schedule_config.get("run_key")
        or trigger_config.get("execution_key")
        or trigger_config.get("run_key")
    )
    if isinstance(explicit_key, str) and explicit_key.strip():
        return explicit_key.strip().lower()

    bucket = scheduled_for or _now_utc_naive()
    bucket_key = bucket.replace(second=0, microsecond=0).isoformat()
    return ":".join(
        [
            reminder.reminder_key.strip().lower(),
            reminder.trigger_type.strip().lower(),
            trigger_source.strip().lower(),
            bucket_key,
        ]
    )


def _build_execution_payload(
    reminder: ReminderDefinition,
    *,
    trigger_source: str,
    scheduled_for: datetime | None,
    execution_key: str,
    execution_context: dict[str, Any],
) -> dict[str, Any]:
    return {
        "reminder": {
            "id": str(reminder.id),
            "reminder_key": reminder.reminder_key,
            "name": reminder.name,
            "target_domain": reminder.target_domain,
            "trigger_type": reminder.trigger_type,
            "notification_channels": reminder.notification_channels,
            "notification_template_key": reminder.notification_template_key,
        },
        "execution": {
            "execution_key": execution_key,
            "trigger_source": trigger_source,
            "scheduled_for": scheduled_for.isoformat() if scheduled_for else None,
            "evaluation_context": execution_context,
        },
    }


def _build_execution_metadata(*, evaluated_at: datetime, reason: str, trigger_source: str) -> dict[str, Any]:
    return {
        "evaluated_at": evaluated_at.isoformat(),
        "reason": reason,
        "trigger_source": trigger_source,
    }


def _default_retry_delay_seconds(attempt_count: int) -> int:
    retry_delay = DEFAULT_REMINDER_RETRY_DELAY_SECONDS * max(attempt_count, 1)
    return min(retry_delay, MAX_REMINDER_RETRY_DELAY_SECONDS)


def evaluate_reminder_execution(
    reminder: ReminderDefinition,
    *,
    now: datetime | None = None,
    execution_context: dict[str, Any] | None = None,
) -> ReminderExecutionEvaluation:
    evaluation_time = _now_utc_naive(now)
    context = execution_context or {}
    trigger_source = _normalize_text(context.get("trigger_source"), fallback=reminder.trigger_type)
    scheduled_for = _read_schedule_datetime(reminder, context)
    expires_at = _read_expiration_datetime(reminder, context)
    starts_at = _read_start_datetime(reminder, context)

    if not reminder.is_active:
        reason = "inactive_reminder"
        status = ReminderExecutionQueueItem.STATUS_SKIPPED
        return ReminderExecutionEvaluation(
            reminder_id=str(reminder.id),
            reminder_key=reminder.reminder_key,
            trigger_source=trigger_source,
            execution_key=_build_execution_key(
                reminder,
                trigger_source=trigger_source,
                scheduled_for=scheduled_for or evaluation_time,
                execution_context=context,
            ),
            is_eligible=False,
            status=status,
            reason=reason,
            scheduled_for=scheduled_for,
            metadata=_build_execution_metadata(evaluated_at=evaluation_time, reason=reason, trigger_source=trigger_source),
        )

    if starts_at and evaluation_time < starts_at:
        reason = "not_started"
        status = ReminderExecutionQueueItem.STATUS_SKIPPED
        return ReminderExecutionEvaluation(
            reminder_id=str(reminder.id),
            reminder_key=reminder.reminder_key,
            trigger_source=trigger_source,
            execution_key=_build_execution_key(
                reminder,
                trigger_source=trigger_source,
                scheduled_for=scheduled_for or starts_at,
                execution_context=context,
            ),
            is_eligible=False,
            status=status,
            reason=reason,
            scheduled_for=scheduled_for,
            metadata=_build_execution_metadata(evaluated_at=evaluation_time, reason=reason, trigger_source=trigger_source),
        )

    if expires_at and evaluation_time > expires_at:
        reason = "expired"
        status = ReminderExecutionQueueItem.STATUS_SKIPPED
        return ReminderExecutionEvaluation(
            reminder_id=str(reminder.id),
            reminder_key=reminder.reminder_key,
            trigger_source=trigger_source,
            execution_key=_build_execution_key(
                reminder,
                trigger_source=trigger_source,
                scheduled_for=scheduled_for or expires_at,
                execution_context=context,
            ),
            is_eligible=False,
            status=status,
            reason=reason,
            scheduled_for=scheduled_for,
            metadata=_build_execution_metadata(evaluated_at=evaluation_time, reason=reason, trigger_source=trigger_source),
        )

    if reminder.trigger_type == ReminderDefinition.TRIGGER_MANUAL and not context.get("allow_manual_execution"):
        reason = "manual_trigger_requires_explicit_request"
        status = ReminderExecutionQueueItem.STATUS_SKIPPED
        return ReminderExecutionEvaluation(
            reminder_id=str(reminder.id),
            reminder_key=reminder.reminder_key,
            trigger_source=trigger_source,
            execution_key=_build_execution_key(
                reminder,
                trigger_source=trigger_source,
                scheduled_for=scheduled_for or evaluation_time,
                execution_context=context,
            ),
            is_eligible=False,
            status=status,
            reason=reason,
            scheduled_for=scheduled_for,
            metadata=_build_execution_metadata(evaluated_at=evaluation_time, reason=reason, trigger_source=trigger_source),
        )

    if reminder.trigger_type == ReminderDefinition.TRIGGER_EVENT and not (context.get("triggered") or context.get("event_fired")):
        reason = "awaiting_event_trigger"
        status = ReminderExecutionQueueItem.STATUS_SKIPPED
        return ReminderExecutionEvaluation(
            reminder_id=str(reminder.id),
            reminder_key=reminder.reminder_key,
            trigger_source=trigger_source,
            execution_key=_build_execution_key(
                reminder,
                trigger_source=trigger_source,
                scheduled_for=scheduled_for or evaluation_time,
                execution_context=context,
            ),
            is_eligible=False,
            status=status,
            reason=reason,
            scheduled_for=scheduled_for,
            metadata=_build_execution_metadata(evaluated_at=evaluation_time, reason=reason, trigger_source=trigger_source),
        )

    if reminder.trigger_type == ReminderDefinition.TRIGGER_SCHEDULED:
        if scheduled_for is None:
            scheduled_for = evaluation_time
        if evaluation_time < scheduled_for:
            reason = "not_due"
            status = ReminderExecutionQueueItem.STATUS_SKIPPED
            return ReminderExecutionEvaluation(
                reminder_id=str(reminder.id),
                reminder_key=reminder.reminder_key,
                trigger_source=trigger_source,
                execution_key=_build_execution_key(
                    reminder,
                    trigger_source=trigger_source,
                    scheduled_for=scheduled_for,
                    execution_context=context,
                ),
                is_eligible=False,
                status=status,
                reason=reason,
                scheduled_for=scheduled_for,
                metadata=_build_execution_metadata(evaluated_at=evaluation_time, reason=reason, trigger_source=trigger_source),
            )

    if scheduled_for is None:
        scheduled_for = evaluation_time

    reason = "eligible"
    status = ReminderExecutionQueueItem.STATUS_QUEUED
    execution_key = _build_execution_key(
        reminder,
        trigger_source=trigger_source,
        scheduled_for=scheduled_for,
        execution_context=context,
    )
    payload = _build_execution_payload(
        reminder,
        trigger_source=trigger_source,
        scheduled_for=scheduled_for,
        execution_key=execution_key,
        execution_context=context,
    )
    metadata = _build_execution_metadata(evaluated_at=evaluation_time, reason=reason, trigger_source=trigger_source)

    return ReminderExecutionEvaluation(
        reminder_id=str(reminder.id),
        reminder_key=reminder.reminder_key,
        trigger_source=trigger_source,
        execution_key=execution_key,
        is_eligible=True,
        status=status,
        reason=reason,
        scheduled_for=scheduled_for,
        payload=payload,
        metadata=metadata,
    )


class ReminderExecutionPipeline:
    """Coordinates reminder execution stages without changing underlying component behavior."""

    def __init__(self, db: Session):
        self.db = db

    def evaluate_eligibility(
        self,
        reminder: ReminderDefinition,
        *,
        context: ReminderPipelineContext,
    ) -> ReminderExecutionEvaluation:
        return evaluate_reminder_execution(
            reminder,
            now=context.now,
            execution_context=context.execution_context,
        )

    def build_execution_plan(
        self,
        reminder: ReminderDefinition,
        *,
        evaluation: ReminderExecutionEvaluation,
        context: ReminderPipelineContext,
    ) -> tuple[ReminderExecutionQueueItem | None, bool]:
        if not evaluation.is_eligible:
            return None, False

        existing = (
            self.db.query(ReminderExecutionQueueItem)
            .filter(ReminderExecutionQueueItem.execution_key == evaluation.execution_key)
            .first()
        )
        if existing:
            return existing, True

        max_attempts = context.execution_context.get("max_attempts", DEFAULT_REMINDER_MAX_ATTEMPTS)
        if not isinstance(max_attempts, int) or max_attempts < 1:
            max_attempts = DEFAULT_REMINDER_MAX_ATTEMPTS

        queue_item = ReminderExecutionQueueItem(
            reminder_id=reminder.id,
            execution_key=evaluation.execution_key,
            trigger_source=evaluation.trigger_source,
            status=ReminderExecutionQueueItem.STATUS_QUEUED,
            eligibility_reason=evaluation.reason,
            scheduled_for=evaluation.scheduled_for,
            evaluated_at=context.now,
            queued_at=context.now,
            attempt_count=0,
            max_attempts=max_attempts,
            execution_payload=evaluation.payload,
            queue_metadata=evaluation.metadata,
            created_by_user_id=context.actor_user_id,
        )
        self.db.add(queue_item)
        self.db.flush()
        return queue_item, False

    def render_payload(
        self,
        reminder: ReminderDefinition,
        *,
        evaluation: ReminderExecutionEvaluation,
        context: ReminderPipelineContext,
    ) -> ReminderExecutionEvaluation:
        # Keep render stage explicit for pipeline lifecycle clarity.
        if evaluation.payload is None and evaluation.is_eligible:
            payload = _build_execution_payload(
                reminder,
                trigger_source=evaluation.trigger_source,
                scheduled_for=evaluation.scheduled_for,
                execution_key=evaluation.execution_key,
                execution_context=context.execution_context,
            )
            evaluation.payload = payload
        return evaluation

    def record_evaluation(
        self,
        reminder: ReminderDefinition,
        *,
        evaluation: ReminderExecutionEvaluation,
        context: ReminderPipelineContext,
    ) -> None:
        record_reminder_audit_event(
            self.db,
            reminder_id=reminder.id,
            event_type="reminder_execution_evaluated",
            actor_user_id=context.actor_user_id,
            source=context.source,
            details={
                "execution_key": evaluation.execution_key,
                "reason": evaluation.reason,
                "status": evaluation.status,
                "scheduled_for": evaluation.scheduled_for.isoformat() if evaluation.scheduled_for else None,
                "trigger_source": evaluation.trigger_source,
            },
        )

    def queue_batch(
        self,
        *,
        now: datetime | None = None,
        reminder_id: UUID | None = None,
        target_domain: str | None = None,
        execution_context: dict[str, Any] | None = None,
        actor_user_id: str | None = None,
        source: str = "reminder.execution_engine",
        limit: int | None = None,
    ) -> ReminderExecutionBatchResult:
        stage_context = ReminderPipelineContext(
            now=_now_utc_naive(now),
            execution_context=execution_context or {},
            actor_user_id=actor_user_id,
            source=source,
        )

        query = self.db.query(ReminderDefinition)
        if reminder_id:
            query = query.filter(ReminderDefinition.id == reminder_id)
        if target_domain:
            query = query.filter(ReminderDefinition.target_domain == target_domain.strip().lower())

        reminders = query.order_by(ReminderDefinition.created_at.asc(), ReminderDefinition.reminder_key.asc())
        if limit is not None:
            reminders = reminders.limit(limit)
        reminder_rows = reminders.all()

        queued_items: list[ReminderExecutionQueueItem] = []
        evaluations: list[ReminderExecutionEvaluation] = []
        queued_count = 0
        skipped_count = 0
        duplicate_count = 0

        for reminder in reminder_rows:
            evaluation = self.evaluate_eligibility(reminder, context=stage_context)
            evaluation = self.render_payload(reminder, evaluation=evaluation, context=stage_context)
            evaluations.append(evaluation)
            self.record_evaluation(reminder, evaluation=evaluation, context=stage_context)

            if not evaluation.is_eligible:
                skipped_count += 1
                record_reminder_audit_event(
                    self.db,
                    reminder_id=reminder.id,
                    event_type="reminder_execution_skipped",
                    actor_user_id=stage_context.actor_user_id,
                    source=stage_context.source,
                    details={
                        "execution_key": evaluation.execution_key,
                        "reason": evaluation.reason,
                        "trigger_source": evaluation.trigger_source,
                    },
                )
                continue

            queue_item, is_duplicate = self.build_execution_plan(reminder, evaluation=evaluation, context=stage_context)
            if queue_item is None:
                skipped_count += 1
                continue

            if is_duplicate:
                duplicate_count += 1
                record_reminder_audit_event(
                    self.db,
                    reminder_id=reminder.id,
                    event_type="reminder_execution_duplicate_suppressed",
                    actor_user_id=stage_context.actor_user_id,
                    source=stage_context.source,
                    details={
                        "execution_key": evaluation.execution_key,
                        "queue_item_id": str(queue_item.id),
                        "status": queue_item.status,
                    },
                )
                continue

            if queue_item not in queued_items:
                queued_items.append(queue_item)
                queued_count += 1
                record_reminder_audit_event(
                    self.db,
                    reminder_id=reminder.id,
                    event_type="reminder_execution_queued",
                    actor_user_id=stage_context.actor_user_id,
                    source=stage_context.source,
                    details={
                        "execution_key": evaluation.execution_key,
                        "queue_item_id": str(queue_item.id),
                        "scheduled_for": evaluation.scheduled_for.isoformat() if evaluation.scheduled_for else None,
                        "trigger_source": evaluation.trigger_source,
                    },
                )

        self.db.commit()

        for queue_item in queued_items:
            self.db.refresh(queue_item)

        return ReminderExecutionBatchResult(
            evaluated_count=len(reminder_rows),
            queued_count=queued_count,
            skipped_count=skipped_count,
            duplicate_count=duplicate_count,
            queued_items=queued_items,
            evaluations=evaluations,
        )

    def dispatch(
        self,
        *,
        execution_item_id: UUID,
        actor_user_id: str | None,
        dispatch_callback: DispatchCallback,
        source: str = "reminder.execution_pipeline.dispatch",
    ) -> ReminderExecutionQueueItem:
        queue_item = mark_reminder_execution_started(
            self.db,
            execution_item_id=execution_item_id,
            actor_user_id=actor_user_id,
            source=source,
        )
        try:
            dispatch_outcome = dispatch_callback(queue_item)
        except Exception as exc:
            dispatch_outcome = ReminderDispatchOutcome(succeeded=False, error_message=str(exc))

        if dispatch_outcome.succeeded:
            return self.record_result(
                execution_item_id=execution_item_id,
                actor_user_id=actor_user_id,
                result=dispatch_outcome.result,
                source=source,
            )

        return self.apply_retry_strategy(
            execution_item_id=execution_item_id,
            actor_user_id=actor_user_id,
            error_message=dispatch_outcome.error_message or "Reminder execution dispatch failed",
            retry_after_seconds=dispatch_outcome.retry_after_seconds,
            source=source,
        )

    def apply_retry_strategy(
        self,
        *,
        execution_item_id: UUID,
        actor_user_id: str | None,
        error_message: str,
        retry_after_seconds: int | None = None,
        source: str = "reminder.execution_pipeline.retry",
    ) -> ReminderExecutionQueueItem:
        return mark_reminder_execution_failed(
            self.db,
            execution_item_id=execution_item_id,
            actor_user_id=actor_user_id,
            error_message=error_message,
            retry_after_seconds=retry_after_seconds,
            source=source,
        )

    def record_result(
        self,
        *,
        execution_item_id: UUID,
        actor_user_id: str | None,
        result: dict[str, Any] | None = None,
        source: str = "reminder.execution_pipeline.result",
    ) -> ReminderExecutionQueueItem:
        return mark_reminder_execution_succeeded(
            self.db,
            execution_item_id=execution_item_id,
            actor_user_id=actor_user_id,
            result=result,
            source=source,
        )


def queue_eligible_reminders(
    db: Session,
    *,
    now: datetime | None = None,
    reminder_id: UUID | None = None,
    target_domain: str | None = None,
    execution_context: dict[str, Any] | None = None,
    actor_user_id: str | None = None,
    source: str = "reminder.execution_engine",
    limit: int | None = None,
) -> ReminderExecutionBatchResult:
    return ReminderExecutionPipeline(db).queue_batch(
        now=now,
        reminder_id=reminder_id,
        target_domain=target_domain,
        execution_context=execution_context,
        actor_user_id=actor_user_id,
        source=source,
        limit=limit,
    )


def dispatch_reminder_execution(
    db: Session,
    *,
    execution_item_id: UUID,
    actor_user_id: str | None,
    dispatch_callback: DispatchCallback,
    source: str = "reminder.execution_pipeline.dispatch",
) -> ReminderExecutionQueueItem:
    return ReminderExecutionPipeline(db).dispatch(
        execution_item_id=execution_item_id,
        actor_user_id=actor_user_id,
        dispatch_callback=dispatch_callback,
        source=source,
    )


def _load_queue_item(db: Session, execution_item_id: UUID) -> ReminderExecutionQueueItem:
    queue_item = db.query(ReminderExecutionQueueItem).filter(ReminderExecutionQueueItem.id == execution_item_id).first()
    if not queue_item:
        raise HTTPException(status_code=404, detail="Reminder execution queue item not found")
    return queue_item


def mark_reminder_execution_started(
    db: Session,
    *,
    execution_item_id: UUID,
    actor_user_id: str | None,
    source: str = "reminder.execution_engine",
) -> ReminderExecutionQueueItem:
    queue_item = _load_queue_item(db, execution_item_id)
    now = _now_utc_naive()

    if queue_item.status not in {ReminderExecutionQueueItem.STATUS_QUEUED, ReminderExecutionQueueItem.STATUS_RETRY_SCHEDULED}:
        raise HTTPException(status_code=409, detail="Reminder execution is not ready to start")

    queue_item.status = ReminderExecutionQueueItem.STATUS_RUNNING
    queue_item.started_at = now
    queue_item.attempt_count = (queue_item.attempt_count or 0) + 1

    record_reminder_audit_event(
        db,
        reminder_id=queue_item.reminder_id,
        event_type="reminder_execution_started",
        actor_user_id=actor_user_id,
        source=source,
        details={
            "execution_key": queue_item.execution_key,
            "execution_item_id": str(queue_item.id),
            "attempt_count": queue_item.attempt_count,
        },
    )

    db.commit()
    db.refresh(queue_item)
    return queue_item


def mark_reminder_execution_succeeded(
    db: Session,
    *,
    execution_item_id: UUID,
    actor_user_id: str | None,
    result: dict[str, Any] | None = None,
    source: str = "reminder.execution_engine",
) -> ReminderExecutionQueueItem:
    queue_item = _load_queue_item(db, execution_item_id)
    now = _now_utc_naive()

    queue_item.status = ReminderExecutionQueueItem.STATUS_SUCCEEDED
    queue_item.completed_at = now
    queue_item.last_error = None
    queue_item.next_retry_at = None

    record_reminder_audit_event(
        db,
        reminder_id=queue_item.reminder_id,
        event_type="reminder_execution_succeeded",
        actor_user_id=actor_user_id,
        source=source,
        details={
            "execution_key": queue_item.execution_key,
            "execution_item_id": str(queue_item.id),
            "attempt_count": queue_item.attempt_count,
            "result": result,
        },
    )

    db.commit()
    db.refresh(queue_item)
    return queue_item


def mark_reminder_execution_failed(
    db: Session,
    *,
    execution_item_id: UUID,
    actor_user_id: str | None,
    error_message: str,
    retry_after_seconds: int | None = None,
    source: str = "reminder.execution_engine",
) -> ReminderExecutionQueueItem:
    queue_item = _load_queue_item(db, execution_item_id)
    now = _now_utc_naive()
    normalized_error = error_message.strip() or "Reminder execution failed"

    queue_item.last_error = normalized_error

    if (queue_item.attempt_count or 0) < (queue_item.max_attempts or DEFAULT_REMINDER_MAX_ATTEMPTS):
        retry_delay_seconds = retry_after_seconds or _default_retry_delay_seconds(queue_item.attempt_count or 1)
        queue_item.status = ReminderExecutionQueueItem.STATUS_RETRY_SCHEDULED
        queue_item.next_retry_at = now + timedelta(seconds=retry_delay_seconds)
        queue_item.completed_at = None
        event_type = "reminder_execution_retry_scheduled"
        event_details = {
            "execution_key": queue_item.execution_key,
            "execution_item_id": str(queue_item.id),
            "attempt_count": queue_item.attempt_count,
            "retry_after_seconds": retry_delay_seconds,
            "next_retry_at": queue_item.next_retry_at.isoformat() if queue_item.next_retry_at else None,
            "error_message": normalized_error,
        }
    else:
        queue_item.status = ReminderExecutionQueueItem.STATUS_FAILED
        queue_item.completed_at = now
        queue_item.next_retry_at = None
        event_type = "reminder_execution_failed"
        event_details = {
            "execution_key": queue_item.execution_key,
            "execution_item_id": str(queue_item.id),
            "attempt_count": queue_item.attempt_count,
            "error_message": normalized_error,
        }

    record_reminder_audit_event(
        db,
        reminder_id=queue_item.reminder_id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        source=source,
        details=event_details,
    )

    db.commit()
    db.refresh(queue_item)
    return queue_item