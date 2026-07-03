from __future__ import annotations

import unittest
from datetime import UTC, datetime

from api.services.dashboard_metrics_aggregator import ReadOnlyDashboardMetricsAggregator
from api.services.telemetry_store import InMemoryTelemetryStore, TelemetryRecord


class DashboardMetricsAggregatorTests(unittest.TestCase):
    def test_aggregate_counts_distributions_and_recent_activity(self) -> None:
        store = InMemoryTelemetryStore()
        first = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 7, 3, 10, 0, tzinfo=UTC),
            category="execution",
            execution_id="exec-1",
            provider_name="email.noop",
            channel="email",
            payload={"status": "success"},
        )
        second = TelemetryRecord.create(
            event_type="execution_failed",
            occurred_at=datetime(2026, 7, 3, 11, 0, tzinfo=UTC),
            category="execution",
            execution_id="exec-2",
            provider_name="email.noop",
            channel="email",
            payload={"status": "failed"},
        )
        third = TelemetryRecord.create(
            event_type="retry_evaluated",
            occurred_at=datetime(2026, 7, 3, 12, 0, tzinfo=UTC),
            category="retry",
            execution_id="exec-3",
            provider_name="email.smtp",
            channel="email",
            tags={"status": "pending"},
        )
        for record in (first, second, third):
            store.write(record)

        aggregator = ReadOnlyDashboardMetricsAggregator(store, clock=lambda: datetime(2026, 7, 3, 12, 30, tzinfo=UTC))
        snapshot = aggregator.aggregate(recent_activity_limit=2)

        self.assertEqual(snapshot.generated_at, datetime(2026, 7, 3, 12, 30, tzinfo=UTC))
        self.assertEqual(snapshot.total_events, 3)
        self.assertEqual(snapshot.event_type_counts["execution_started"], 1)
        self.assertEqual(snapshot.event_type_counts["execution_failed"], 1)
        self.assertEqual(snapshot.event_type_counts["retry_evaluated"], 1)
        self.assertEqual(snapshot.status_counts["success"], 1)
        self.assertEqual(snapshot.status_counts["failed"], 1)
        self.assertEqual(snapshot.status_counts["pending"], 1)
        self.assertEqual(snapshot.category_counts["execution"], 2)
        self.assertEqual(snapshot.category_counts["retry"], 1)
        self.assertEqual(snapshot.provider_counts["email.noop"], 2)
        self.assertEqual(snapshot.provider_counts["email.smtp"], 1)
        self.assertEqual(snapshot.channel_counts["email"], 3)
        self.assertEqual(len(snapshot.recent_activity), 2)
        self.assertEqual(snapshot.recent_activity[0].event_id, third.event_id)
        self.assertEqual(snapshot.recent_activity[0].status, "pending")
        self.assertEqual(snapshot.recent_activity[1].event_id, second.event_id)

        metric_values = snapshot.as_metric_values()
        self.assertEqual(metric_values["telemetry.total"], 3)
        self.assertEqual(metric_values["event_type.execution_started"], 1)
        self.assertEqual(metric_values["status.success"], 1)
        self.assertEqual(metric_values["recent_activity.total"], 2)

    def test_aggregate_handles_empty_dataset(self) -> None:
        store = InMemoryTelemetryStore()
        aggregator = ReadOnlyDashboardMetricsAggregator(store, clock=lambda: datetime(2026, 7, 3, 12, 30, tzinfo=UTC))

        snapshot = aggregator.aggregate()

        self.assertEqual(snapshot.total_events, 0)
        self.assertEqual(dict(snapshot.event_type_counts), {})
        self.assertEqual(dict(snapshot.status_counts), {})
        self.assertEqual(dict(snapshot.category_counts), {})
        self.assertEqual(dict(snapshot.provider_counts), {})
        self.assertEqual(dict(snapshot.channel_counts), {})
        self.assertEqual(snapshot.recent_activity, ())
        self.assertEqual(snapshot.as_metric_values()["telemetry.total"], 0)


if __name__ == "__main__":
    unittest.main()
