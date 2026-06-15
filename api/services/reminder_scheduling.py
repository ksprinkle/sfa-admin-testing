from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass
class ReminderScheduleRequest:
    reminder_id: str
    scheduled_for: datetime
    payload: dict[str, Any] | None = None
    actor_user_id: str | None = None


@dataclass
class ReminderScheduleResult:
    schedule_id: str
    status: str
    scheduled_for: datetime | None = None
    metadata: dict[str, Any] | None = None


class ReminderScheduler(Protocol):
    key: str

    def schedule(self, request: ReminderScheduleRequest) -> ReminderScheduleResult:
        ...

    def cancel(self, schedule_id: str) -> bool:
        ...


class NoopReminderScheduler:
    key = "noop"

    def schedule(self, request: ReminderScheduleRequest) -> ReminderScheduleResult:
        schedule_id = f"noop-reminder-{abs(hash((request.reminder_id, request.scheduled_for.isoformat()))) % 10_000_000}"
        return ReminderScheduleResult(
            schedule_id=schedule_id,
            status="queued",
            scheduled_for=request.scheduled_for,
            metadata={"scheduler": self.key},
        )

    def cancel(self, schedule_id: str) -> bool:
        return False


_SCHEDULERS: dict[str, ReminderScheduler] = {
    NoopReminderScheduler.key: NoopReminderScheduler(),
}


def register_reminder_scheduler(scheduler: ReminderScheduler) -> None:
    _SCHEDULERS[scheduler.key] = scheduler


def get_reminder_scheduler(scheduler_key: str) -> ReminderScheduler:
    key = (scheduler_key or "noop").strip().lower()
    return _SCHEDULERS.get(key, _SCHEDULERS["noop"])


def list_reminder_scheduler_keys() -> list[str]:
    return sorted(_SCHEDULERS.keys())