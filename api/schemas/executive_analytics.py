from datetime import datetime

from pydantic import BaseModel


class ExecutiveMetricCardOut(BaseModel):
    metric_key: str
    label: str
    value: int | float | str
    calculated_at: datetime
    data_source: str
    not_tracked: bool = False


class ExecutiveAnalyticsOut(BaseModel):
    generated_at: datetime
    cards: list[ExecutiveMetricCardOut]


class ExecutiveDomainAggregateOut(BaseModel):
    domain: str
    metrics: dict[str, int | float | str]
    calculated_at: datetime


class ExecutiveSummaryOut(BaseModel):
    generated_at: datetime
    aggregates: list[ExecutiveDomainAggregateOut]
