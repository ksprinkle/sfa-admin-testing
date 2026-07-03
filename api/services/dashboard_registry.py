from __future__ import annotations

from collections import OrderedDict

from api.models.dashboard import DashboardWidgetDefinition, MetricSource


def _normalize_key(value: str) -> str:
    normalized = (value or "").strip().lower()
    if not normalized:
        raise ValueError("Dashboard registry keys must not be empty")
    return normalized


class DashboardRegistry:
    def __init__(
        self,
        *,
        metric_sources: list[MetricSource] | tuple[MetricSource, ...] | None = None,
        widgets: list[DashboardWidgetDefinition] | tuple[DashboardWidgetDefinition, ...] | None = None,
    ) -> None:
        self._metric_sources: OrderedDict[str, MetricSource] = OrderedDict()
        self._widgets: OrderedDict[str, DashboardWidgetDefinition] = OrderedDict()

        for metric_source in metric_sources or ():
            self.register_metric_source(metric_source)
        for widget in widgets or ():
            self.register_widget(widget)

    def register_metric_source(self, metric_source: MetricSource) -> MetricSource:
        key = _normalize_key(metric_source.source_key)
        if key in self._metric_sources:
            raise ValueError(f"Dashboard metric source already registered: {metric_source.source_key}")
        self._metric_sources[key] = metric_source
        return metric_source

    def register_widget(self, widget: DashboardWidgetDefinition) -> DashboardWidgetDefinition:
        key = _normalize_key(widget.widget_key)
        if key in self._widgets:
            raise ValueError(f"Dashboard widget already registered: {widget.widget_key}")
        self._widgets[key] = widget
        return widget

    def get_metric_source(self, source_key: str) -> MetricSource:
        key = _normalize_key(source_key)
        try:
            return self._metric_sources[key]
        except KeyError as exc:
            raise KeyError(f"Dashboard metric source not registered: {source_key}") from exc

    def get_widget(self, widget_key: str) -> DashboardWidgetDefinition:
        key = _normalize_key(widget_key)
        try:
            return self._widgets[key]
        except KeyError as exc:
            raise KeyError(f"Dashboard widget not registered: {widget_key}") from exc

    def list_metric_sources(self) -> tuple[MetricSource, ...]:
        return tuple(self._metric_sources.values())

    def list_widgets(self) -> tuple[DashboardWidgetDefinition, ...]:
        return tuple(self._widgets.values())
