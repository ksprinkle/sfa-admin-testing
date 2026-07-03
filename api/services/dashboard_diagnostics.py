from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from types import MappingProxyType

from api.models.dashboard_diagnostics import (
    DashboardDiagnosticFinding,
    DashboardDiagnosticSeverity,
    DashboardDiagnosticsReport,
    DashboardHealthStatus,
    DashboardHealthSummary,
)
from api.services.dashboard_metrics_aggregator import DashboardMetricsAggregator, DashboardMetricsSnapshot
from api.services.dashboard_service import DashboardService


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _count_for(snapshot: DashboardMetricsSnapshot, key: str) -> int:
    return int(snapshot.status_counts.get(key, 0))


def _build_findings(
    *,
    snapshot: DashboardMetricsSnapshot,
    dashboard_service: DashboardService,
) -> tuple[DashboardDiagnosticFinding, ...]:
    findings: list[DashboardDiagnosticFinding] = []

    if snapshot.total_events == 0:
        findings.append(
            DashboardDiagnosticFinding(
                code="no_telemetry",
                severity=DashboardDiagnosticSeverity.WARNING,
                message="No telemetry records are available for dashboard diagnostics.",
                details=MappingProxyType({"total_events": 0}),
            )
        )

    if len(dashboard_service.registry.list_metric_sources()) == 0:
        findings.append(
            DashboardDiagnosticFinding(
                code="no_metric_sources",
                severity=DashboardDiagnosticSeverity.WARNING,
                message="No dashboard metric sources are registered.",
                details=MappingProxyType({"metric_source_count": 0}),
            )
        )

    if len(dashboard_service.registry.list_widgets()) == 0:
        findings.append(
            DashboardDiagnosticFinding(
                code="no_widgets",
                severity=DashboardDiagnosticSeverity.WARNING,
                message="No dashboard widgets are registered.",
                details=MappingProxyType({"widget_count": 0}),
            )
        )

    failure_count = _count_for(snapshot, "failed") + _count_for(snapshot, "temporary_failure")
    if failure_count > 0:
        findings.append(
            DashboardDiagnosticFinding(
                code="failures_present",
                severity=DashboardDiagnosticSeverity.CRITICAL,
                message="Failure activity is present in the telemetry snapshot.",
                details=MappingProxyType({"failure_count": failure_count}),
            )
        )

    if snapshot.total_events > 0 and len(snapshot.recent_activity) == 0:
        findings.append(
            DashboardDiagnosticFinding(
                code="no_recent_activity",
                severity=DashboardDiagnosticSeverity.INFO,
                message="Telemetry exists but no recent activity summary was produced.",
                details=MappingProxyType({"total_events": snapshot.total_events}),
            )
        )

    return tuple(findings)


def _build_health_summary(
    *,
    snapshot: DashboardMetricsSnapshot,
    dashboard_service: DashboardService,
    findings: tuple[DashboardDiagnosticFinding, ...],
) -> DashboardHealthSummary:
    metric_source_count = len(dashboard_service.registry.list_metric_sources())
    widget_count = len(dashboard_service.registry.list_widgets())
    failure_count = _count_for(snapshot, "failed") + _count_for(snapshot, "temporary_failure")
    warning_count = sum(1 for finding in findings if finding.severity == DashboardDiagnosticSeverity.WARNING)

    if snapshot.total_events == 0:
        overall_status = DashboardHealthStatus.EMPTY
    elif failure_count > 0 or metric_source_count == 0 or widget_count == 0:
        overall_status = DashboardHealthStatus.DEGRADED
    else:
        overall_status = DashboardHealthStatus.HEALTHY

    last_event_type = snapshot.recent_activity[0].event_type if snapshot.recent_activity else None
    last_event_status = snapshot.recent_activity[0].status if snapshot.recent_activity else None

    return DashboardHealthSummary(
        overall_status=overall_status,
        generated_at=snapshot.generated_at,
        total_events=snapshot.total_events,
        failure_count=failure_count,
        warning_count=warning_count,
        metric_source_count=metric_source_count,
        widget_count=widget_count,
        recent_activity_count=len(snapshot.recent_activity),
        metric_value_total=int(snapshot.total_events),
        last_event_type=last_event_type,
        last_event_status=last_event_status,
        status_counts=MappingProxyType(dict(snapshot.status_counts)),
    )


class DashboardDiagnosticsService:
    def generate_report(self, *args, **kwargs) -> DashboardDiagnosticsReport:
        raise NotImplementedError

    def summarize_health(self, *args, **kwargs) -> DashboardHealthSummary:
        raise NotImplementedError


class ReadOnlyDashboardDiagnosticsService(DashboardDiagnosticsService):
    def __init__(
        self,
        dashboard_service: DashboardService,
        metrics_aggregator: DashboardMetricsAggregator,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._dashboard_service = dashboard_service
        self._metrics_aggregator = metrics_aggregator
        self._clock = clock or _utcnow

    def summarize_health(self, *, recent_activity_limit: int = 5) -> DashboardHealthSummary:
        overview = self._dashboard_service.build_overview()
        snapshot = self._metrics_aggregator.aggregate(recent_activity_limit=recent_activity_limit)
        findings = _build_findings(snapshot=snapshot, dashboard_service=self._dashboard_service)
        return _build_health_summary(snapshot=snapshot, dashboard_service=self._dashboard_service, findings=findings)

    def generate_report(self, *, recent_activity_limit: int = 5) -> DashboardDiagnosticsReport:
        overview = self._dashboard_service.build_overview()
        snapshot = self._metrics_aggregator.aggregate(recent_activity_limit=recent_activity_limit)
        findings = _build_findings(snapshot=snapshot, dashboard_service=self._dashboard_service)
        health_summary = _build_health_summary(snapshot=snapshot, dashboard_service=self._dashboard_service, findings=findings)

        return DashboardDiagnosticsReport(
            generated_at=self._clock(),
            dashboard_key=overview.dashboard_key,
            title=overview.title,
            health_summary=health_summary,
            findings=findings,
            overview=overview,
            metrics_snapshot=snapshot,
            read_only=True,
        )
