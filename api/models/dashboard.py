from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from types import MappingProxyType
from typing import Any

from api.services.telemetry_store import TelemetryQuery


def _normalize_key(value: str) -> str:
    normalized = (value or "").strip().lower()
    if not normalized:
        raise ValueError("Dashboard keys must not be empty")
    return normalized


def _normalize_label(value: str) -> str:
    label = (value or "").strip()
    if not label:
        raise ValueError("Dashboard labels must not be empty")
    return label


def _normalize_mapping(value: dict[str, Any] | None) -> MappingProxyType:
    return MappingProxyType(dict(value or {}))


@dataclass(frozen=True)
class MetricSource:
    source_key: str
    metric_key: str
    label: str
    description: str = ""
    event_types: tuple[str, ...] = field(default_factory=tuple)
    category: str | None = None
    aggregation: str = "count"
    read_only: bool = True

    def __post_init__(self) -> None:
        object.__setattr__(self, "source_key", _normalize_key(self.source_key))
        object.__setattr__(self, "metric_key", _normalize_key(self.metric_key))
        object.__setattr__(self, "label", _normalize_label(self.label))
        object.__setattr__(self, "description", (self.description or "").strip())
        object.__setattr__(self, "event_types", tuple((item or "").strip() for item in self.event_types if str(item or "").strip()))
        object.__setattr__(self, "category", (self.category or "").strip().lower() or None)
        object.__setattr__(self, "aggregation", (self.aggregation or "count").strip().lower() or "count")

    def to_query(self) -> TelemetryQuery:
        return TelemetryQuery(
            event_types=set(self.event_types) if self.event_types else None,
            category=self.category,
        )


@dataclass(frozen=True)
class DashboardWidgetDefinition:
    widget_key: str
    title: str
    description: str = ""
    metric_keys: tuple[str, ...] = field(default_factory=tuple)
    source_keys: tuple[str, ...] = field(default_factory=tuple)
    order: int = 0
    visible: bool = True

    def __post_init__(self) -> None:
        object.__setattr__(self, "widget_key", _normalize_key(self.widget_key))
        object.__setattr__(self, "title", _normalize_label(self.title))
        object.__setattr__(self, "description", (self.description or "").strip())
        object.__setattr__(self, "metric_keys", tuple(_normalize_key(item) for item in self.metric_keys))
        object.__setattr__(self, "source_keys", tuple(_normalize_key(item) for item in self.source_keys))


@dataclass(frozen=True)
class DashboardOverview:
    dashboard_key: str
    title: str
    generated_at: datetime
    metric_values: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))
    widgets: tuple[DashboardWidgetDefinition, ...] = field(default_factory=tuple)
    metric_sources: tuple[MetricSource, ...] = field(default_factory=tuple)
    summary: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))
    read_only: bool = True

    def __post_init__(self) -> None:
        object.__setattr__(self, "dashboard_key", _normalize_key(self.dashboard_key))
        object.__setattr__(self, "title", _normalize_label(self.title))
        object.__setattr__(self, "metric_values", _normalize_mapping(dict(self.metric_values)))
        object.__setattr__(self, "summary", _normalize_mapping(dict(self.summary)))
        object.__setattr__(self, "widgets", tuple(self.widgets))
        object.__setattr__(self, "metric_sources", tuple(self.metric_sources))
