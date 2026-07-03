from __future__ import annotations

import unittest
from datetime import UTC, datetime

from api.models.dashboard import DashboardWidgetDefinition, MetricSource
from api.services.dashboard_metrics_aggregator import DashboardMetricsSnapshot, DashboardActivitySummary, ReadOnlyDashboardMetricsAggregator
from api.services.dashboard_registry import DashboardRegistry
from api.services.dashboard_service import DashboardService
from api.services.telemetry_store import InMemoryTelemetryStore, TelemetryQuery, TelemetryRecord, TelemetryStore


class _ReadOnlyTelemetryStore(TelemetryStore):
    def __init__(self, records: list[TelemetryRecord]) -> None:
        self._delegate = InMemoryTelemetryStore()
        for record in records:
            self._delegate.write(record)

    def write(self, record: TelemetryRecord) -> TelemetryRecord:
        raise AssertionError("DashboardService must not write telemetry")

    def read(self, event_id: str) -> TelemetryRecord | None:
        return self._delegate.read(event_id)

    def query(self, query: TelemetryQuery | None = None) -> list[TelemetryRecord]:
        return self._delegate.query(query)

    def delete(self, event_id: str) -> bool:
        raise AssertionError("DashboardService must not delete telemetry")

    def apply_retention(self, *, now=None, retain_for=None) -> int:
        raise AssertionError("DashboardService must not apply retention")


class _StaticMetricsAggregator(ReadOnlyDashboardMetricsAggregator):
    def __init__(self, snapshot: DashboardMetricsSnapshot) -> None:
        self._snapshot = snapshot

    def aggregate(self, *, query=None, recent_activity_limit: int = 5) -> DashboardMetricsSnapshot:
        return self._snapshot


class DashboardServiceTests(unittest.TestCase):
    def test_build_overview_uses_aggregated_telemetry_metrics(self) -> None:
        records = [
            TelemetryRecord.create(event_type="execution_started", execution_id="exec-1"),
            TelemetryRecord.create(event_type="execution_started", execution_id="exec-2"),
            TelemetryRecord.create(event_type="execution_failed", execution_id="exec-3"),
            TelemetryRecord.create(event_type="retry_evaluated", execution_id="exec-4"),
        ]
        store = _ReadOnlyTelemetryStore(records)
        registry = DashboardRegistry(
            metric_sources=(
                MetricSource(
                    source_key="Execution Started",
                    metric_key="Execution Started",
                    label="Execution Started",
                    event_types=("execution_started",),
                ),
                MetricSource(
                    source_key="Execution Failed",
                    metric_key="Execution Failed",
                    label="Execution Failed",
                    event_types=("execution_failed",),
                ),
                MetricSource(
                    source_key="Retry Evaluated",
                    metric_key="Retry Evaluated",
                    label="Retry Evaluated",
                    event_types=("retry_evaluated",),
                ),
            ),
            widgets=(
                DashboardWidgetDefinition(
                    widget_key="Execution Health",
                    title="Execution Health",
                    metric_keys=("Execution Started", "Execution Failed"),
                ),
            ),
        )
        aggregator = ReadOnlyDashboardMetricsAggregator(store, clock=lambda: datetime(2026, 7, 3, 12, 0, tzinfo=UTC))
        service = DashboardService(telemetry_store=store, registry=registry, metrics_aggregator=aggregator, clock=lambda: datetime(2026, 7, 3, 12, 0, tzinfo=UTC))

        overview = service.build_overview()

        self.assertEqual(overview.dashboard_key, "operational_dashboard")
        self.assertEqual(overview.generated_at, datetime(2026, 7, 3, 12, 0, tzinfo=UTC))
        self.assertEqual(overview.metric_values["telemetry.total"], 4)
        self.assertEqual(overview.metric_values["event_type.execution_started"], 2)
        self.assertEqual(overview.metric_values["event_type.execution_failed"], 1)
        self.assertEqual(overview.metric_values["event_type.retry_evaluated"], 1)
        self.assertEqual(overview.summary["metric_source_count"], 3)
        self.assertEqual(overview.summary["widget_count"], 1)
        self.assertEqual(overview.summary["metric_value_total"], 4)
        self.assertEqual(overview.summary["telemetry_total"], 4)
        self.assertEqual(overview.summary["recent_activity_count"], 4)
        self.assertEqual(len(overview.widgets), 1)
        self.assertEqual(len(overview.metric_sources), 3)

        self.assertEqual(len(store.query()), 4)

    def test_service_registers_sources_and_widgets_through_registry(self) -> None:
        store = _ReadOnlyTelemetryStore([])
        service = DashboardService(store)

        source = MetricSource(
            source_key="Queue Health",
            metric_key="Queue Health",
            label="Queue Health",
            event_types=("queue_depth_measured",),
        )
        widget = DashboardWidgetDefinition(
            widget_key="Queue Overview",
            title="Queue Overview",
            metric_keys=("Queue Health",),
        )

        service.register_metric_source(source)
        service.register_widget(widget)

        overview = service.build_overview(dashboard_key="queue_dashboard", title="Queue Dashboard")

        self.assertEqual(service.registry.get_metric_source("queue health"), source)
        self.assertEqual(service.registry.get_widget("queue overview"), widget)
        self.assertEqual(overview.dashboard_key, "queue_dashboard")
        self.assertEqual(overview.title, "Queue Dashboard")
        self.assertEqual(overview.metric_values["telemetry.total"], 0)

    def test_empty_dataset_produces_empty_distribution_metrics(self) -> None:
        store = _ReadOnlyTelemetryStore([])
        snapshot = DashboardMetricsSnapshot(
            generated_at=datetime(2026, 7, 3, 12, 0, tzinfo=UTC),
            total_events=0,
        )
        service = DashboardService(
            telemetry_store=store,
            registry=DashboardRegistry(),
            metrics_aggregator=_StaticMetricsAggregator(snapshot),
            clock=lambda: datetime(2026, 7, 3, 12, 0, tzinfo=UTC),
        )

        overview = service.build_overview()

        self.assertEqual(overview.metric_values["telemetry.total"], 0)
        self.assertEqual(overview.summary["metric_value_total"], 0)
        self.assertEqual(overview.summary["recent_activity_count"], 0)


if __name__ == "__main__":
    unittest.main()
