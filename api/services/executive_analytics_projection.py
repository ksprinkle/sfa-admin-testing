from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.models.events import Event
from api.models.participants import Participant
from api.models.sessions import Session as EventSession
from api.schemas.executive_analytics import ExecutiveAnalyticsOut, ExecutiveMetricCardOut
from api.services.volunteer_dashboard_projection import get_volunteer_dashboard_projection
from api.services.waiver_reporting import get_dashboard_metrics


def _utcnow() -> datetime:
    return datetime.utcnow()


def _base_participant_query(db: Session):
    return db.query(Participant).filter(
        Participant.removed_at.is_(None),
        func.lower(func.trim(func.coalesce(Participant.role, ""))) != "volunteer",
    )


def _active_event_ids_select():
    today = date.today()
    return select(Event.id).where(
        Event.status.in_(["published", "draft"]),
        Event.start_date >= today,
    )


def _card(
    *,
    metric_key: str,
    label: str,
    value: int | float | str,
    calculated_at: datetime,
    data_source: str,
    not_tracked: bool = False,
) -> ExecutiveMetricCardOut:
    return ExecutiveMetricCardOut(
        metric_key=metric_key,
        label=label,
        value=value,
        calculated_at=calculated_at,
        data_source=data_source,
        not_tracked=not_tracked,
    )


def get_executive_analytics_projection(db: Session) -> ExecutiveAnalyticsOut:
    calculated_at = _utcnow()
    cards: list[ExecutiveMetricCardOut] = []

    participants_total = int(_base_participant_query(db).count() or 0)
    participants_checked_in = int(_base_participant_query(db).filter(Participant.checked_in.is_(True)).count() or 0)
    participants_not_checked_in = int(_base_participant_query(db).filter(Participant.checked_in.is_(False)).count() or 0)

    cards.append(
        _card(
            metric_key="participants_total",
            label="Total Participants",
            value=participants_total,
            calculated_at=calculated_at,
            data_source="participants",
        )
    )
    cards.append(
        _card(
            metric_key="participants_checked_in",
            label="Participants Checked In",
            value=participants_checked_in,
            calculated_at=calculated_at,
            data_source="participants",
        )
    )
    cards.append(
        _card(
            metric_key="participants_not_checked_in",
            label="Participants Not Checked In",
            value=participants_not_checked_in,
            calculated_at=calculated_at,
            data_source="participants",
        )
    )

    waiver_metrics = get_dashboard_metrics(db)
    waivers_verified = int(waiver_metrics.waivers_signed)
    waivers_pending = int(
        _base_participant_query(db)
        .filter(Participant.waiver_verified.is_(False))
        .count()
        or 0
    )
    waiver_completion_percentage = float(waiver_metrics.completion_rate)

    cards.append(
        _card(
            metric_key="waivers_verified",
            label="Verified Waivers",
            value=waivers_verified,
            calculated_at=calculated_at,
            data_source="participant_waivers,participants",
        )
    )
    cards.append(
        _card(
            metric_key="waivers_pending",
            label="Pending Waivers",
            value=waivers_pending,
            calculated_at=calculated_at,
            data_source="participants",
        )
    )
    cards.append(
        _card(
            metric_key="waiver_completion_percentage",
            label="Waiver Completion Percentage",
            value=waiver_completion_percentage,
            calculated_at=calculated_at,
            data_source="participant_waivers,participants",
        )
    )

    volunteer_projection = get_volunteer_dashboard_projection(db)
    cards.append(
        _card(
            metric_key="volunteers_total",
            label="Total Volunteers",
            value=int(volunteer_projection.summary.total_volunteers),
            calculated_at=calculated_at,
            data_source="participants,sessions,participant_waivers",
        )
    )
    cards.append(
        _card(
            metric_key="volunteers_ready",
            label="Volunteers Ready",
            value=int(volunteer_projection.summary.ready),
            calculated_at=calculated_at,
            data_source="volunteer_dashboard_projection",
        )
    )
    cards.append(
        _card(
            metric_key="volunteers_action_required",
            label="Volunteers Action Required",
            value=int(volunteer_projection.summary.action_required),
            calculated_at=calculated_at,
            data_source="volunteer_dashboard_projection",
        )
    )
    cards.append(
        _card(
            metric_key="volunteers_checked_in",
            label="Volunteers Checked In",
            value=int(volunteer_projection.summary.checked_in),
            calculated_at=calculated_at,
            data_source="volunteer_dashboard_projection",
        )
    )
    cards.append(
        _card(
            metric_key="volunteers_incomplete",
            label="Volunteers Incomplete",
            value=int(volunteer_projection.summary.incomplete),
            calculated_at=calculated_at,
            data_source="volunteer_dashboard_projection",
        )
    )

    active_event_ids_select = _active_event_ids_select()
    active_sessions = int(
        db.query(func.count(EventSession.id))
        .filter(EventSession.event_id.in_(active_event_ids_select))
        .scalar()
        or 0
    )
    cards.append(
        _card(
            metric_key="events_active_sessions",
            label="Active Sessions",
            value=active_sessions,
            calculated_at=calculated_at,
            data_source="events,sessions",
        )
    )

    total_capacity = (
        db.query(func.sum(Event.participant_capacity))
        .filter(
            Event.id.in_(active_event_ids_select),
            Event.participant_capacity.isnot(None),
            Event.participant_capacity > 0,
        )
        .scalar()
    )
    utilized_count = int(
        _base_participant_query(db)
        .filter(
            Participant.event_id.in_(active_event_ids_select),
            Participant.is_waitlisted.is_(False),
        )
        .count()
        or 0
    )

    if total_capacity and float(total_capacity) > 0:
        utilization_percentage = round((utilized_count / float(total_capacity)) * 100, 2)
        cards.append(
            _card(
                metric_key="events_capacity_utilization_percentage",
                label="Capacity Utilization Percentage",
                value=float(utilization_percentage),
                calculated_at=calculated_at,
                data_source="events,participants",
            )
        )
    else:
        cards.append(
            _card(
                metric_key="events_capacity_utilization_percentage",
                label="Capacity Utilization Percentage",
                value="Not Tracked",
                calculated_at=calculated_at,
                data_source="events",
                not_tracked=True,
            )
        )

    cards.append(
        _card(
            metric_key="compliance_tracking_status",
            label="Compliance Tracking",
            value="Not Tracked",
            calculated_at=calculated_at,
            data_source="participants",
            not_tracked=True,
        )
    )

    return ExecutiveAnalyticsOut(generated_at=calculated_at, cards=cards)
