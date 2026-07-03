from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from api.models.dashboard import DashboardOverview, DashboardWidgetDefinition, MetricSource
from api.services.dashboard_metrics_aggregator import DashboardMetricsAggregator, ReadOnlyDashboardMetricsAggregator
from api.services.dashboard_registry import DashboardRegistry
from api.services.telemetry_store import TelemetryStore


def _utcnow() -> datetime:
    return datetime.now(UTC)


class DashboardService:
    def __init__(
        self,
        telemetry_store: TelemetryStore,
        registry: DashboardRegistry | None = None,
        *,
        metrics_aggregator: DashboardMetricsAggregator | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._telemetry_store = telemetry_store
        self._registry = registry or DashboardRegistry()
        self._clock = clock or _utcnow
        self._metrics_aggregator = metrics_aggregator or ReadOnlyDashboardMetricsAggregator(telemetry_store, clock=self._clock)

    @property
    def registry(self) -> DashboardRegistry:
        return self._registry

    @property
    def telemetry_store(self) -> TelemetryStore:
        return self._telemetry_store

    @property
    def metrics_aggregator(self) -> DashboardMetricsAggregator:
        return self._metrics_aggregator

    def register_metric_source(self, metric_source: MetricSource) -> MetricSource:
        return self._registry.register_metric_source(metric_source)

    def register_widget(self, widget: DashboardWidgetDefinition) -> DashboardWidgetDefinition:
        return self._registry.register_widget(widget)

    def build_overview(
        self,
        *,
        dashboard_key: str = "operational_dashboard",
        title: str = "Operational Dashboard",
    ) -> DashboardOverview:
        metric_sources = self._registry.list_metric_sources()
        widgets = self._registry.list_widgets()
        snapshot = self._metrics_aggregator.aggregate(recent_activity_limit=5)
        metric_values = snapshot.as_metric_values()

        summary: dict[str, Any] = {
            "telemetry_total": snapshot.total_events,
            "metric_source_count": len(metric_sources),
            "widget_count": len(widgets),
            "metric_value_total": snapshot.total_events,
            "recent_activity_count": len(snapshot.recent_activity),
        }

        return DashboardOverview(
            dashboard_key=dashboard_key,
            title=title,
            generated_at=self._clock(),
            metric_values=metric_values,
            widgets=widgets,
            metric_sources=metric_sources,
            summary=summary,
            read_only=True,
        )
