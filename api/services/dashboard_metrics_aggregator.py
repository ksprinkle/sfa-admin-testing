from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from types import MappingProxyType
from typing import Any, Callable, Protocol

from api.services.telemetry_store import TelemetryQuery, TelemetryRecord, TelemetryStore


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _normalize_key(value: str | None) -> str:
    return (value or "").strip().lower()


def _normalize_status(record: TelemetryRecord) -> str:
    payload_status = record.payload.get("status") if isinstance(record.payload, dict) else None
    tags_status = record.tags.get("status") if isinstance(record.tags, dict) else None
    status = _normalize_key(str(payload_status or tags_status or record.category or record.event_type))
    return status or "unknown"


def _increment(mapping: dict[str, int], key: str) -> None:
    normalized_key = _normalize_key(key)
    if not normalized_key:
        return
    mapping[normalized_key] = mapping.get(normalized_key, 0) + 1


@dataclass(frozen=True)
class DashboardActivitySummary:
    event_id: str
    event_type: str
    occurred_at: datetime
    status: str
    category: str | None = None
    execution_id: str | None = None
    reminder_id: str | None = None
    provider_name: str | None = None
    channel: str | None = None
    payload: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))


@dataclass(frozen=True)
class DashboardMetricsSnapshot:
    generated_at: datetime
    total_events: int
    event_type_counts: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))
    status_counts: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))
    category_counts: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))
    provider_counts: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))
    channel_counts: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))
    recent_activity: tuple[DashboardActivitySummary, ...] = field(default_factory=tuple)
    read_only: bool = True

    def as_metric_values(self) -> dict[str, int]:
        metric_values: dict[str, int] = {"telemetry.total": self.total_events}

        for event_type, value in self.event_type_counts.items():
            metric_values[f"event_type.{event_type}"] = int(value)
        for status, value in self.status_counts.items():
            metric_values[f"status.{status}"] = int(value)
        for category, value in self.category_counts.items():
            metric_values[f"category.{category}"] = int(value)
        for provider, value in self.provider_counts.items():
            metric_values[f"provider.{provider}"] = int(value)
        for channel, value in self.channel_counts.items():
            metric_values[f"channel.{channel}"] = int(value)

        metric_values["recent_activity.total"] = len(self.recent_activity)
        return metric_values


class DashboardMetricsAggregator(Protocol):
    def aggregate(
        self,
        *,
        query: TelemetryQuery | None = None,
        recent_activity_limit: int = 5,
    ) -> DashboardMetricsSnapshot:
        ...


class ReadOnlyDashboardMetricsAggregator:
    def __init__(self, telemetry_store: TelemetryStore, *, clock: Callable[[], datetime] | None = None) -> None:
        self._telemetry_store = telemetry_store
        self._clock = clock or _utcnow

    def aggregate(
        self,
        *,
        query: TelemetryQuery | None = None,
        recent_activity_limit: int = 5,
    ) -> DashboardMetricsSnapshot:
        records = self._telemetry_store.query(query)
        ordered_records = sorted(records, key=lambda record: (record.occurred_at, record.event_id))

        event_type_counts: dict[str, int] = {}
        status_counts: dict[str, int] = {}
        category_counts: dict[str, int] = {}
        provider_counts: dict[str, int] = {}
        channel_counts: dict[str, int] = {}

        for record in ordered_records:
            _increment(event_type_counts, record.event_type)
            _increment(status_counts, _normalize_status(record))
            if record.category:
                _increment(category_counts, record.category)
            if record.provider_name:
                _increment(provider_counts, record.provider_name)
            if record.channel:
                _increment(channel_counts, record.channel)

        recent_records = ordered_records[-recent_activity_limit:] if recent_activity_limit > 0 else []
        recent_activity = tuple(
            DashboardActivitySummary(
                event_id=record.event_id,
                event_type=record.event_type,
                occurred_at=record.occurred_at,
                status=_normalize_status(record),
                category=record.category,
                execution_id=record.execution_id,
                reminder_id=record.reminder_id,
                provider_name=record.provider_name,
                channel=record.channel,
                payload=MappingProxyType(dict(record.payload or {})),
            )
            for record in reversed(recent_records)
        )

        return DashboardMetricsSnapshot(
            generated_at=self._clock(),
            total_events=len(ordered_records),
            event_type_counts=MappingProxyType(event_type_counts),
            status_counts=MappingProxyType(status_counts),
            category_counts=MappingProxyType(category_counts),
            provider_counts=MappingProxyType(provider_counts),
            channel_counts=MappingProxyType(channel_counts),
            recent_activity=recent_activity,
            read_only=True,
        )
