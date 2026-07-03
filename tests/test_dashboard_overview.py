from __future__ import annotations

import unittest
from datetime import UTC, datetime

from api.models.dashboard import DashboardOverview, DashboardWidgetDefinition, MetricSource


class DashboardOverviewTests(unittest.TestCase):
    def test_dashboard_overview_normalizes_and_freezes_read_only_contract(self) -> None:
        widget = DashboardWidgetDefinition(
            widget_key="Execution Health",
            title="Execution Health",
            metric_keys=("Execution Started",),
        )
        source = MetricSource(
            source_key="Execution Started",
            metric_key="Execution Started",
            label="Execution Started",
            event_types=("execution_started",),
        )

        overview = DashboardOverview(
            dashboard_key="Operational Dashboard",
            title="Operational Dashboard",
            generated_at=datetime(2026, 7, 3, 12, 0, tzinfo=UTC),
            metric_values={"Execution Started": 3},
            widgets=(widget,),
            metric_sources=(source,),
            summary={"widget_count": 1},
        )

        self.assertEqual(overview.dashboard_key, "operational dashboard")
        self.assertEqual(overview.title, "Operational Dashboard")
        self.assertEqual(overview.metric_values["Execution Started"], 3)
        self.assertEqual(overview.summary["widget_count"], 1)
        self.assertEqual(overview.widgets[0].widget_key, "execution health")
        self.assertEqual(overview.metric_sources[0].source_key, "execution started")

        with self.assertRaises(TypeError):
            overview.metric_values["another"] = 1


if __name__ == "__main__":
    unittest.main()
