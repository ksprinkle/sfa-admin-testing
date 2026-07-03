from __future__ import annotations

import unittest

from api.models.dashboard import DashboardWidgetDefinition, MetricSource
from api.services.dashboard_registry import DashboardRegistry


class DashboardRegistryTests(unittest.TestCase):
    def test_register_and_lookup_metric_sources_and_widgets(self) -> None:
        registry = DashboardRegistry()
        source = MetricSource(
            source_key="Execution Started",
            metric_key="Execution Started",
            label="Execution Started",
            event_types=("execution_started",),
        )
        widget = DashboardWidgetDefinition(
            widget_key="Execution Health",
            title="Execution Health",
            metric_keys=("Execution Started",),
        )

        registry.register_metric_source(source)
        registry.register_widget(widget)

        self.assertEqual(registry.get_metric_source("execution started"), source)
        self.assertEqual(registry.get_widget("execution health"), widget)
        self.assertEqual(registry.list_metric_sources(), (source,))
        self.assertEqual(registry.list_widgets(), (widget,))

    def test_duplicate_keys_are_rejected(self) -> None:
        registry = DashboardRegistry()
        source = MetricSource(
            source_key="Execution Started",
            metric_key="Execution Started",
            label="Execution Started",
            event_types=("execution_started",),
        )
        widget = DashboardWidgetDefinition(
            widget_key="Execution Health",
            title="Execution Health",
        )

        registry.register_metric_source(source)
        registry.register_widget(widget)

        with self.assertRaises(ValueError):
            registry.register_metric_source(source)

        with self.assertRaises(ValueError):
            registry.register_widget(widget)


if __name__ == "__main__":
    unittest.main()
