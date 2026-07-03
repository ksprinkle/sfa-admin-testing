from __future__ import annotations

from collections.abc import Iterator

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_admin
from api.models.dashboard import DashboardOverview, DashboardWidgetDefinition, MetricSource
from api.models.dashboard_diagnostics import (
    DashboardDiagnosticFinding,
    DashboardDiagnosticsReport,
    DashboardHealthSummary,
)
from api.schemas.dashboard import (
    DashboardActivitySummaryOut,
    DashboardDiagnosticFindingOut,
    DashboardDiagnosticsReportOut,
    DashboardHealthSummaryOut,
    DashboardMetricsSnapshotOut,
    DashboardOverviewOut,
    DashboardWidgetDefinitionOut,
    MetricSourceOut,
)
from api.services.dashboard_diagnostics import ReadOnlyDashboardDiagnosticsService
from api.services.dashboard_metrics_aggregator import DashboardMetricsSnapshot, ReadOnlyDashboardMetricsAggregator
from api.services.dashboard_registry import DashboardRegistry
from api.services.dashboard_service import DashboardService
from api.services.telemetry_store import SqlAlchemyTelemetryStore


router = APIRouter(
    prefix="/admin/dashboard",
    tags=["Admin Dashboard"],
)


def _build_dashboard_registry() -> DashboardRegistry:
    return DashboardRegistry(
        metric_sources=(
            MetricSource(
                source_key="execution health",
                metric_key="execution_health",
                label="Execution Health",
                description="Aggregated execution lifecycle metrics.",
                event_types=("execution_started", "execution_completed", "execution_failed", "execution_skipped"),
                category="execution",
            ),
            MetricSource(
                source_key="retry health",
                metric_key="retry_health",
                label="Retry Health",
                description="Aggregated retry lifecycle metrics.",
                event_types=("retry_evaluated", "retry_scheduled", "retry_exhausted"),
                category="retry",
            ),
            MetricSource(
                source_key="provider health",
                metric_key="provider_health",
                label="Provider Health",
                description="Aggregated provider lifecycle metrics.",
                event_types=("delivery_started", "delivery_succeeded", "delivery_failed", "delivery_cancelled"),
                category="delivery",
            ),
            MetricSource(
                source_key="queue health",
                metric_key="queue_health",
                label="Queue Health",
                description="Aggregated queue lifecycle metrics.",
                event_types=("queue_created", "queue_due", "queue_completed", "queue_failed"),
                category="queue",
            ),
        ),
        widgets=(
            DashboardWidgetDefinition(
                widget_key="overview",
                title="Overview",
                description="Summary of operational dashboard health.",
                metric_keys=("execution_health", "retry_health", "provider_health", "queue_health"),
                source_keys=("execution health", "retry health", "provider health", "queue health"),
                order=1,
            ),
            DashboardWidgetDefinition(
                widget_key="execution-health",
                title="Execution Health",
                description="Execution lifecycle visibility.",
                metric_keys=("execution_health",),
                source_keys=("execution health",),
                order=2,
            ),
            DashboardWidgetDefinition(
                widget_key="retry-health",
                title="Retry Health",
                description="Retry lifecycle visibility.",
                metric_keys=("retry_health",),
                source_keys=("retry health",),
                order=3,
            ),
            DashboardWidgetDefinition(
                widget_key="provider-health",
                title="Provider Health",
                description="Provider delivery visibility.",
                metric_keys=("provider_health",),
                source_keys=("provider health",),
                order=4,
            ),
            DashboardWidgetDefinition(
                widget_key="queue-health",
                title="Queue Health",
                description="Queue visibility.",
                metric_keys=("queue_health",),
                source_keys=("queue health",),
                order=5,
            ),
            DashboardWidgetDefinition(
                widget_key="diagnostics",
                title="Diagnostics",
                description="Read-only diagnostics and troubleshooting views.",
                metric_keys=("execution_health", "retry_health", "provider_health", "queue_health"),
                source_keys=("execution health", "retry health", "provider health", "queue health"),
                order=6,
            ),
        ),
    )


def _build_dashboard_service(db: Session) -> DashboardService:
    telemetry_store = SqlAlchemyTelemetryStore(lambda: db, close_session_after_use=False)
    registry = _build_dashboard_registry()
    return DashboardService(
        telemetry_store=telemetry_store,
        registry=registry,
        metrics_aggregator=ReadOnlyDashboardMetricsAggregator(telemetry_store),
    )


def _build_diagnostics_service(db: Session) -> ReadOnlyDashboardDiagnosticsService:
    dashboard_service = _build_dashboard_service(db)
    telemetry_store = dashboard_service.telemetry_store
    metrics_aggregator = ReadOnlyDashboardMetricsAggregator(telemetry_store)
    return ReadOnlyDashboardDiagnosticsService(
        dashboard_service=dashboard_service,
        metrics_aggregator=metrics_aggregator,
    )


def _widget_out(widget: DashboardWidgetDefinition) -> DashboardWidgetDefinitionOut:
    return DashboardWidgetDefinitionOut.model_validate(widget)


def _metric_source_out(metric_source: MetricSource) -> MetricSourceOut:
    return MetricSourceOut(
        source_key=metric_source.source_key,
        metric_key=metric_source.metric_key,
        label=metric_source.label,
        description=metric_source.description,
        event_types=list(metric_source.event_types),
        category=metric_source.category,
        aggregation=metric_source.aggregation,
        read_only=metric_source.read_only,
    )


def _activity_out(activity) -> DashboardActivitySummaryOut:
    return DashboardActivitySummaryOut(
        event_id=activity.event_id,
        event_type=activity.event_type,
        occurred_at=activity.occurred_at,
        status=activity.status,
        category=activity.category,
        execution_id=activity.execution_id,
        reminder_id=activity.reminder_id,
        provider_name=activity.provider_name,
        channel=activity.channel,
        payload=dict(activity.payload),
    )


def _overview_out(overview: DashboardOverview) -> DashboardOverviewOut:
    return DashboardOverviewOut(
        dashboard_key=overview.dashboard_key,
        title=overview.title,
        generated_at=overview.generated_at,
        metric_values=dict(overview.metric_values),
        widgets=[_widget_out(widget) for widget in overview.widgets],
        metric_sources=[_metric_source_out(source) for source in overview.metric_sources],
        summary=dict(overview.summary),
        read_only=overview.read_only,
    )


def _snapshot_out(snapshot: DashboardMetricsSnapshot) -> DashboardMetricsSnapshotOut:
    return DashboardMetricsSnapshotOut(
        generated_at=snapshot.generated_at,
        total_events=snapshot.total_events,
        event_type_counts=dict(snapshot.event_type_counts),
        status_counts=dict(snapshot.status_counts),
        category_counts=dict(snapshot.category_counts),
        provider_counts=dict(snapshot.provider_counts),
        channel_counts=dict(snapshot.channel_counts),
        recent_activity=[_activity_out(activity) for activity in snapshot.recent_activity],
        read_only=snapshot.read_only,
    )


def _diagnostic_finding_out(finding: DashboardDiagnosticFinding) -> DashboardDiagnosticFindingOut:
    return DashboardDiagnosticFindingOut(
        code=finding.code,
        severity=finding.severity.value,
        message=finding.message,
        details=dict(finding.details),
    )


def _health_summary_out(summary: DashboardHealthSummary) -> DashboardHealthSummaryOut:
    return DashboardHealthSummaryOut(
        overall_status=summary.overall_status.value,
        generated_at=summary.generated_at,
        total_events=summary.total_events,
        failure_count=summary.failure_count,
        warning_count=summary.warning_count,
        metric_source_count=summary.metric_source_count,
        widget_count=summary.widget_count,
        recent_activity_count=summary.recent_activity_count,
        metric_value_total=summary.metric_value_total,
        last_event_type=summary.last_event_type,
        last_event_status=summary.last_event_status,
        status_counts=dict(summary.status_counts),
    )


@router.get("/overview", response_model=DashboardOverviewOut)
def get_dashboard_overview(
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    service = _build_dashboard_service(db)
    return _overview_out(service.build_overview())


@router.get("/metrics", response_model=DashboardMetricsSnapshotOut)
def get_dashboard_metrics(
    recent_activity_limit: int = Query(default=5, ge=0, le=25),
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    service = _build_dashboard_service(db)
    snapshot = service.metrics_aggregator.aggregate(recent_activity_limit=recent_activity_limit)
    return _snapshot_out(snapshot)


@router.get("/diagnostics/summary", response_model=DashboardHealthSummaryOut)
def get_dashboard_diagnostics_summary(
    recent_activity_limit: int = Query(default=5, ge=0, le=25),
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    service = _build_diagnostics_service(db)
    return _health_summary_out(service.summarize_health(recent_activity_limit=recent_activity_limit))


@router.get("/diagnostics/report", response_model=DashboardDiagnosticsReportOut)
def get_dashboard_diagnostics_report(
    recent_activity_limit: int = Query(default=5, ge=0, le=25),
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    service = _build_diagnostics_service(db)
    report = service.generate_report(recent_activity_limit=recent_activity_limit)
    return DashboardDiagnosticsReportOut(
        generated_at=report.generated_at,
        dashboard_key=report.dashboard_key,
        title=report.title,
        health_summary=_health_summary_out(report.health_summary),
        findings=[_diagnostic_finding_out(finding) for finding in report.findings],
        overview=_overview_out(report.overview),
        metrics_snapshot=_snapshot_out(report.metrics_snapshot),
        read_only=report.read_only,
    )
