from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class DashboardWidgetDefinitionOut(BaseModel):
    widget_key: str
    title: str
    description: str
    metric_keys: list[str]
    source_keys: list[str]
    order: int
    visible: bool

    model_config = ConfigDict(from_attributes=True)


class MetricSourceOut(BaseModel):
    source_key: str
    metric_key: str
    label: str
    description: str
    event_types: list[str]
    category: str | None = None
    aggregation: str
    read_only: bool

    model_config = ConfigDict(from_attributes=True)


class DashboardOverviewOut(BaseModel):
    dashboard_key: str
    title: str
    generated_at: datetime
    metric_values: dict[str, int]
    widgets: list[DashboardWidgetDefinitionOut]
    metric_sources: list[MetricSourceOut]
    summary: dict[str, Any]
    read_only: bool

    model_config = ConfigDict(from_attributes=True)


class DashboardMetricSourceSummaryOut(BaseModel):
    source_key: str
    metric_key: str
    label: str
    aggregation: str
    count: int


class DashboardActivitySummaryOut(BaseModel):
    event_id: str
    event_type: str
    occurred_at: datetime
    status: str
    category: str | None = None
    execution_id: str | None = None
    reminder_id: str | None = None
    provider_name: str | None = None
    channel: str | None = None
    payload: dict[str, Any]

    model_config = ConfigDict(from_attributes=True)


class DashboardMetricsSnapshotOut(BaseModel):
    generated_at: datetime
    total_events: int
    event_type_counts: dict[str, int]
    status_counts: dict[str, int]
    category_counts: dict[str, int]
    provider_counts: dict[str, int]
    channel_counts: dict[str, int]
    recent_activity: list[DashboardActivitySummaryOut]
    read_only: bool

    model_config = ConfigDict(from_attributes=True)


class DashboardHealthSummaryOut(BaseModel):
    overall_status: str
    generated_at: datetime
    total_events: int
    failure_count: int
    warning_count: int
    metric_source_count: int
    widget_count: int
    recent_activity_count: int
    metric_value_total: int
    last_event_type: str | None = None
    last_event_status: str | None = None
    status_counts: dict[str, int]

    model_config = ConfigDict(from_attributes=True)


class DashboardDiagnosticFindingOut(BaseModel):
    code: str
    severity: str
    message: str
    details: dict[str, Any]

    model_config = ConfigDict(from_attributes=True)


class DashboardDiagnosticsReportOut(BaseModel):
    generated_at: datetime
    dashboard_key: str
    title: str
    health_summary: DashboardHealthSummaryOut
    findings: list[DashboardDiagnosticFindingOut]
    overview: DashboardOverviewOut
    metrics_snapshot: DashboardMetricsSnapshotOut
    read_only: bool

    model_config = ConfigDict(from_attributes=True)
