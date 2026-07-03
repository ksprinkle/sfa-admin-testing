from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from types import MappingProxyType

from api.models.dashboard import DashboardOverview
from api.services.dashboard_metrics_aggregator import DashboardMetricsSnapshot


class DashboardHealthStatus(str, Enum):
    EMPTY = "empty"
    HEALTHY = "healthy"
    DEGRADED = "degraded"


class DashboardDiagnosticSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass(frozen=True)
class DashboardDiagnosticFinding:
    code: str
    severity: DashboardDiagnosticSeverity
    message: str
    details: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))


@dataclass(frozen=True)
class DashboardHealthSummary:
    overall_status: DashboardHealthStatus
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
    status_counts: MappingProxyType = field(default_factory=lambda: MappingProxyType({}))


@dataclass(frozen=True)
class DashboardDiagnosticsReport:
    generated_at: datetime
    dashboard_key: str
    title: str
    health_summary: DashboardHealthSummary
    findings: tuple[DashboardDiagnosticFinding, ...]
    overview: DashboardOverview
    metrics_snapshot: DashboardMetricsSnapshot
    read_only: bool = True
