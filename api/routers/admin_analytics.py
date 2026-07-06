from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_admin
from api.schemas.executive_analytics import (
    ExecutiveAnalyticsOut,
    ExecutiveDomainAggregateOut,
    ExecutiveMetricCardOut,
    ExecutiveSummaryOut,
)
from api.services.executive_analytics_projection import (
    get_executive_analytics_projection,
    get_executive_summary_projection,
)


router = APIRouter(
    prefix="/admin/analytics",
    tags=["Admin Analytics"],
)


def _ensure_non_empty_cards(payload: ExecutiveAnalyticsOut) -> ExecutiveAnalyticsOut:
    if payload.cards:
        return payload

    now = datetime.utcnow()
    fallback_cards = [
        ExecutiveMetricCardOut(
            metric_key="participants_total",
            label="Total Participants",
            value="Not Tracked",
            calculated_at=now,
            data_source="fallback",
            not_tracked=True,
        ),
        ExecutiveMetricCardOut(
            metric_key="volunteers_total",
            label="Total Volunteers",
            value="Not Tracked",
            calculated_at=now,
            data_source="fallback",
            not_tracked=True,
        ),
        ExecutiveMetricCardOut(
            metric_key="waivers_verified",
            label="Verified Waivers",
            value="Not Tracked",
            calculated_at=now,
            data_source="fallback",
            not_tracked=True,
        ),
        ExecutiveMetricCardOut(
            metric_key="events_active_sessions",
            label="Active Sessions",
            value="Not Tracked",
            calculated_at=now,
            data_source="fallback",
            not_tracked=True,
        ),
    ]
    return ExecutiveAnalyticsOut(generated_at=payload.generated_at, cards=fallback_cards)


def _ensure_non_empty_aggregates(payload: ExecutiveSummaryOut) -> ExecutiveSummaryOut:
    if payload.aggregates:
        return payload

    now = datetime.utcnow()
    fallback_aggregates = [
        ExecutiveDomainAggregateOut(
            domain="event_operations",
            metrics={"total": 0, "ready": 0, "at_risk": 0},
            calculated_at=now,
        ),
        ExecutiveDomainAggregateOut(
            domain="communications",
            metrics={"deliveries_total": 0, "deliveries_failed": 0, "deliveries_success_rate_percentage": 0.0},
            calculated_at=now,
        ),
        ExecutiveDomainAggregateOut(
            domain="automation",
            metrics={"runs_total": 0, "runs_failed": 0, "failure_rate_percentage": 0.0},
            calculated_at=now,
        ),
        ExecutiveDomainAggregateOut(
            domain="participants",
            metrics={"total": 0, "checked_in": 0, "check_in_rate_percentage": 0.0},
            calculated_at=now,
        ),
    ]
    return ExecutiveSummaryOut(generated_at=payload.generated_at, aggregates=fallback_aggregates)


@router.get("/executive-dashboard", response_model=ExecutiveAnalyticsOut)
def get_executive_dashboard_metrics(
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    payload = get_executive_analytics_projection(db)
    return _ensure_non_empty_cards(payload)


@router.get("/executive-summary", response_model=ExecutiveSummaryOut)
def get_executive_summary_metrics(
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    payload = get_executive_summary_projection(db)
    return _ensure_non_empty_aggregates(payload)
