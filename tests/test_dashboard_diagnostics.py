from __future__ import annotations

import unittest
from datetime import UTC, datetime

from api.models.dashboard import DashboardWidgetDefinition, MetricSource
from api.models.dashboard_diagnostics import DashboardHealthStatus
from api.services.dashboard_diagnostics import ReadOnlyDashboardDiagnosticsService
from api.services.dashboard_metrics_aggregator import ReadOnlyDashboardMetricsAggregator
from api.services.dashboard_registry import DashboardRegistry
from api.services.dashboard_service import DashboardService
from api.services.telemetry_store import InMemoryTelemetryStore, TelemetryQuery, TelemetryRecord, TelemetryStore


class _ReadOnlyTelemetryStore(TelemetryStore):
    def __init__(self, records: list[TelemetryRecord]) -> None:
        self._delegate = InMemoryTelemetryStore()
        for record in records:
            self._delegate.write(record)

    def write(self, record: TelemetryRecord) -> TelemetryRecord:
        raise AssertionError("Diagnostics must not write telemetry")

    def read(self, event_id: str) -> TelemetryRecord | None:
        return self._delegate.read(event_id)

    def query(self, query: TelemetryQuery | None = None) -> list[TelemetryRecord]:
        return self._delegate.query(query)

    def delete(self, event_id: str) -> bool:
        raise AssertionError("Diagnostics must not delete telemetry")

    def apply_retention(self, *, now=None, retain_for=None) -> int:
        raise AssertionError("Diagnostics must not apply retention")


class DashboardDiagnosticsTests(unittest.TestCase):
    def _service(self, records: list[TelemetryRecord], *, include_widgets: bool = True) -> ReadOnlyDashboardDiagnosticsService:
        store = _ReadOnlyTelemetryStore(records)
        registry = DashboardRegistry(
            metric_sources=(
                MetricSource(
                    source_key="Execution Health",
                    metric_key="Execution Health",
                    label="Execution Health",
                    event_types=("execution_started", "execution_failed"),
                ),
                MetricSource(
                    source_key="Retry Health",
                    metric_key="Retry Health",
                    label="Retry Health",
                    event_types=("retry_evaluated",),
                ),
            ),
            widgets=(
                DashboardWidgetDefinition(
                    widget_key="Execution Overview",
                    title="Execution Overview",
                    metric_keys=("Execution Health", "Retry Health"),
                ),
            ) if include_widgets else (),
        )
        dashboard_service = DashboardService(
            telemetry_store=store,
            registry=registry,
            metrics_aggregator=ReadOnlyDashboardMetricsAggregator(store, clock=lambda: datetime(2026, 7, 3, 12, 0, tzinfo=UTC)),
            clock=lambda: datetime(2026, 7, 3, 12, 0, tzinfo=UTC),
        )
        return ReadOnlyDashboardDiagnosticsService(
            dashboard_service=dashboard_service,
            metrics_aggregator=ReadOnlyDashboardMetricsAggregator(store, clock=lambda: datetime(2026, 7, 3, 12, 0, tzinfo=UTC)),
            clock=lambda: datetime(2026, 7, 3, 12, 30, tzinfo=UTC),
        )

    def test_generate_report_reports_healthy_dashboard(self) -> None:
        service = self._service(
            [
                TelemetryRecord.create(
                    event_type="execution_started",
                    occurred_at=datetime(2026, 7, 3, 10, 0, tzinfo=UTC),
                    payload={"status": "success"},
                ),
                TelemetryRecord.create(
                    event_type="retry_evaluated",
                    occurred_at=datetime(2026, 7, 3, 11, 0, tzinfo=UTC),
                    payload={"status": "success"},
                ),
            ]
        )

        report = service.generate_report(recent_activity_limit=2)

        self.assertEqual(report.health_summary.overall_status, DashboardHealthStatus.HEALTHY)
        self.assertEqual(report.health_summary.total_events, 2)
        self.assertEqual(report.health_summary.failure_count, 0)
        self.assertEqual(report.health_summary.metric_source_count, 2)
        self.assertEqual(report.health_summary.widget_count, 1)
        self.assertEqual(report.findings, ())

    def test_generate_report_flags_failures_and_degraded_health(self) -> None:
        service = self._service(
            [
                TelemetryRecord.create(
                    event_type="execution_started",
                    occurred_at=datetime(2026, 7, 3, 10, 0, tzinfo=UTC),
                    payload={"status": "success"},
                ),
                TelemetryRecord.create(
                    event_type="execution_failed",
                    occurred_at=datetime(2026, 7, 3, 11, 0, tzinfo=UTC),
                    payload={"status": "failed"},
                ),
                TelemetryRecord.create(
                    event_type="retry_evaluated",
                    occurred_at=datetime(2026, 7, 3, 12, 0, tzinfo=UTC),
                    tags={"status": "temporary_failure"},
                ),
            ]
        )

        report = service.generate_report(recent_activity_limit=3)

        self.assertEqual(report.health_summary.overall_status, DashboardHealthStatus.DEGRADED)
        self.assertEqual(report.health_summary.failure_count, 2)
        self.assertTrue(any(finding.code == "failures_present" for finding in report.findings))
        self.assertEqual(report.health_summary.last_event_type, "retry_evaluated")
        self.assertEqual(report.health_summary.last_event_status, "temporary_failure")

    def test_generate_report_handles_empty_dataset_and_missing_configuration(self) -> None:
        service = self._service([], include_widgets=False)

        report = service.generate_report()

        self.assertEqual(report.health_summary.overall_status, DashboardHealthStatus.EMPTY)
        self.assertEqual(report.health_summary.total_events, 0)
        self.assertTrue(any(finding.code == "no_telemetry" for finding in report.findings))
        self.assertTrue(any(finding.code == "no_widgets" for finding in report.findings))
        self.assertEqual(report.health_summary.recent_activity_count, 0)


if __name__ == "__main__":
    unittest.main()
