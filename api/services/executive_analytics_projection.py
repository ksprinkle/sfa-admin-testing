from __future__ import annotations

from datetime import date, datetime, timedelta
import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.models.admin_audit_events import AdminAuditEvent
from api.models.automation_runs import AutomationRun
from api.models.automation_workflows import AutomationWorkflow
from api.models.communication_deliveries import CommunicationDelivery
from api.models.communication_messages import CommunicationMessage
from api.models.communication_templates import CommunicationTemplate
from api.models.event_operations import EventOperation
from api.models.events import Event
from api.models.participants import Participant
from api.models.sessions import Session as EventSession
from api.models.volunteer_profiles import VolunteerProfile
from api.schemas.executive_analytics import (
    ExecutiveAnalyticsOut,
    ExecutiveDomainAggregateOut,
    ExecutiveMetricCardOut,
    ExecutiveSummaryOut,
)
from api.services.volunteer_dashboard_projection import get_volunteer_dashboard_projection
from api.services.waiver_reporting import get_dashboard_metrics


logger = logging.getLogger(__name__)


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

    def _safe_compute(metric_group: str, compute_fn, fallback):
        try:
            return compute_fn()
        except Exception:
            logger.exception("Executive metric group failed", extra={"metric_group": metric_group})
            return fallback

    participants_total, participants_checked_in, participants_not_checked_in = _safe_compute(
        "participants",
        lambda: (
            int(_base_participant_query(db).count() or 0),
            int(_base_participant_query(db).filter(Participant.checked_in.is_(True)).count() or 0),
            int(_base_participant_query(db).filter(Participant.checked_in.is_(False)).count() or 0),
        ),
        (0, 0, 0),
    )

    waivers_verified, waivers_pending, waiver_completion_percentage = _safe_compute(
        "waivers",
        lambda: (
            int(get_dashboard_metrics(db).waivers_signed),
            int(_base_participant_query(db).filter(Participant.waiver_verified.is_(False)).count() or 0),
            float(get_dashboard_metrics(db).completion_rate),
        ),
        (0, 0, 0.0),
    )

    volunteers_total, volunteers_ready, volunteers_action_required, volunteers_checked_in, volunteers_incomplete = _safe_compute(
        "volunteer_dashboard_projection",
        lambda: (
            int(get_volunteer_dashboard_projection(db).summary.total_volunteers),
            int(get_volunteer_dashboard_projection(db).summary.ready),
            int(get_volunteer_dashboard_projection(db).summary.action_required),
            int(get_volunteer_dashboard_projection(db).summary.checked_in),
            int(get_volunteer_dashboard_projection(db).summary.incomplete),
        ),
        (0, 0, 0, 0, 0),
    )

    active_sessions, utilization_value, utilization_not_tracked = _safe_compute(
        "events_capacity",
        lambda: _compute_event_capacity_metrics(db),
        (0, "Not Tracked", True),
    )

    event_ops_total, event_ops_ready, event_ops_at_risk = _safe_compute(
        "event_operations",
        lambda: (
            int(db.query(func.count(EventOperation.id)).scalar() or 0),
            int(
                db.query(func.count(EventOperation.id))
                .filter(EventOperation.readiness_status == EventOperation.READINESS_STATUS_READY)
                .scalar()
                or 0
            ),
            int(
                db.query(func.count(EventOperation.id))
                .filter(EventOperation.operational_status == EventOperation.OPERATIONAL_STATUS_AT_RISK)
                .scalar()
                or 0
            ),
        ),
        (0, 0, 0),
    )

    communication_templates_total, communication_messages_total, communication_deliveries_total, communication_deliveries_failed = _safe_compute(
        "communications",
        lambda: (
            int(db.query(func.count(CommunicationTemplate.id)).scalar() or 0),
            int(db.query(func.count(CommunicationMessage.id)).scalar() or 0),
            int(db.query(func.count(CommunicationDelivery.id)).scalar() or 0),
            int(
                db.query(func.count(CommunicationDelivery.id))
                .filter(CommunicationDelivery.status == CommunicationDelivery.STATUS_FAILED)
                .scalar()
                or 0
            ),
        ),
        (0, 0, 0, 0),
    )

    automation_workflows_total, automation_workflows_enabled, automation_runs_total, automation_runs_failed = _safe_compute(
        "automation",
        lambda: (
            int(db.query(func.count(AutomationWorkflow.id)).scalar() or 0),
            int(
                db.query(func.count(AutomationWorkflow.id))
                .filter(AutomationWorkflow.is_enabled.is_(True))
                .scalar()
                or 0
            ),
            int(db.query(func.count(AutomationRun.id)).scalar() or 0),
            int(
                db.query(func.count(AutomationRun.id))
                .filter(AutomationRun.status == AutomationRun.STATUS_FAILED)
                .scalar()
                or 0
            ),
        ),
        (0, 0, 0, 0),
    )

    volunteers_canonical_total, volunteers_canonical_active = _safe_compute(
        "volunteer_profiles",
        lambda: (
            int(db.query(func.count(VolunteerProfile.id)).scalar() or 0),
            int(
                db.query(func.count(VolunteerProfile.id))
                .filter(VolunteerProfile.lifecycle_status == VolunteerProfile.STATUS_ACTIVE)
                .scalar()
                or 0
            ),
        ),
        (0, 0),
    )

    audit_events_last_7_days = _safe_compute(
        "admin_audit_events",
        lambda: int(
            db.query(func.count(AdminAuditEvent.id))
            .filter(AdminAuditEvent.created_at >= (calculated_at - timedelta(days=7)))
            .scalar()
            or 0
        ),
        0,
    )

    cards.append(_card(metric_key="participants_total", label="Total Participants", value=participants_total, calculated_at=calculated_at, data_source="participants"))
    cards.append(_card(metric_key="participants_checked_in", label="Participants Checked In", value=participants_checked_in, calculated_at=calculated_at, data_source="participants"))
    cards.append(_card(metric_key="participants_not_checked_in", label="Participants Not Checked In", value=participants_not_checked_in, calculated_at=calculated_at, data_source="participants"))

    cards.append(_card(metric_key="waivers_verified", label="Verified Waivers", value=waivers_verified, calculated_at=calculated_at, data_source="participant_waivers,participants"))
    cards.append(_card(metric_key="waivers_pending", label="Pending Waivers", value=waivers_pending, calculated_at=calculated_at, data_source="participants"))
    cards.append(_card(metric_key="waiver_completion_percentage", label="Waiver Completion Percentage", value=waiver_completion_percentage, calculated_at=calculated_at, data_source="participant_waivers,participants"))

    cards.append(_card(metric_key="volunteers_total", label="Total Volunteers", value=volunteers_total, calculated_at=calculated_at, data_source="participants,sessions,participant_waivers"))
    cards.append(_card(metric_key="volunteers_ready", label="Volunteers Ready", value=volunteers_ready, calculated_at=calculated_at, data_source="volunteer_dashboard_projection"))
    cards.append(_card(metric_key="volunteers_action_required", label="Volunteers Action Required", value=volunteers_action_required, calculated_at=calculated_at, data_source="volunteer_dashboard_projection"))
    cards.append(_card(metric_key="volunteers_checked_in", label="Volunteers Checked In", value=volunteers_checked_in, calculated_at=calculated_at, data_source="volunteer_dashboard_projection"))
    cards.append(_card(metric_key="volunteers_incomplete", label="Volunteers Incomplete", value=volunteers_incomplete, calculated_at=calculated_at, data_source="volunteer_dashboard_projection"))

    cards.append(_card(metric_key="events_active_sessions", label="Active Sessions", value=active_sessions, calculated_at=calculated_at, data_source="events,sessions"))
    cards.append(
        _card(
            metric_key="events_capacity_utilization_percentage",
            label="Capacity Utilization Percentage",
            value=utilization_value,
            calculated_at=calculated_at,
            data_source="events,participants",
            not_tracked=utilization_not_tracked,
        )
    )
    cards.append(_card(metric_key="compliance_tracking_status", label="Compliance Tracking", value="Not Tracked", calculated_at=calculated_at, data_source="participants", not_tracked=True))

    cards.append(_card(metric_key="event_operations_total", label="Event Operations Records", value=event_ops_total, calculated_at=calculated_at, data_source="event_operations"))
    cards.append(_card(metric_key="event_operations_ready", label="Event Operations Ready", value=event_ops_ready, calculated_at=calculated_at, data_source="event_operations"))
    cards.append(_card(metric_key="event_operations_at_risk", label="Event Operations At Risk", value=event_ops_at_risk, calculated_at=calculated_at, data_source="event_operations"))

    cards.append(_card(metric_key="communications_templates_total", label="Communication Templates", value=communication_templates_total, calculated_at=calculated_at, data_source="communication_templates"))
    cards.append(_card(metric_key="communications_messages_total", label="Communication Messages", value=communication_messages_total, calculated_at=calculated_at, data_source="communication_messages"))
    cards.append(_card(metric_key="communications_deliveries_total", label="Communication Deliveries", value=communication_deliveries_total, calculated_at=calculated_at, data_source="communication_deliveries"))
    cards.append(_card(metric_key="communications_deliveries_failed", label="Communication Deliveries Failed", value=communication_deliveries_failed, calculated_at=calculated_at, data_source="communication_deliveries"))

    cards.append(_card(metric_key="automation_workflows_total", label="Automation Workflows", value=automation_workflows_total, calculated_at=calculated_at, data_source="automation_workflows"))
    cards.append(_card(metric_key="automation_workflows_enabled", label="Automation Workflows Enabled", value=automation_workflows_enabled, calculated_at=calculated_at, data_source="automation_workflows"))
    cards.append(_card(metric_key="automation_runs_total", label="Automation Runs", value=automation_runs_total, calculated_at=calculated_at, data_source="automation_runs"))
    cards.append(_card(metric_key="automation_runs_failed", label="Automation Runs Failed", value=automation_runs_failed, calculated_at=calculated_at, data_source="automation_runs"))

    cards.append(_card(metric_key="volunteer_profiles_total", label="Volunteer Profiles", value=volunteers_canonical_total, calculated_at=calculated_at, data_source="volunteer_profiles"))
    cards.append(_card(metric_key="volunteer_profiles_active", label="Volunteer Profiles Active", value=volunteers_canonical_active, calculated_at=calculated_at, data_source="volunteer_profiles"))
    cards.append(_card(metric_key="admin_audit_events_last_7_days", label="Admin Audit Events (7d)", value=audit_events_last_7_days, calculated_at=calculated_at, data_source="admin_audit_events"))

    return ExecutiveAnalyticsOut(generated_at=calculated_at, cards=cards)


def _compute_event_capacity_metrics(db: Session) -> tuple[int, float | str, bool]:
    active_event_ids_select = _active_event_ids_select()
    active_sessions = int(
        db.query(func.count(EventSession.id))
        .filter(EventSession.event_id.in_(active_event_ids_select))
        .scalar()
        or 0
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
        return active_sessions, float(utilization_percentage), False

    return active_sessions, "Not Tracked", True


def get_executive_summary_projection(db: Session) -> ExecutiveSummaryOut:
    calculated_at = _utcnow()

    try:
        event_ops_total = int(db.query(func.count(EventOperation.id)).scalar() or 0)
        event_ops_ready = int(
            db.query(func.count(EventOperation.id))
            .filter(EventOperation.readiness_status == EventOperation.READINESS_STATUS_READY)
            .scalar()
            or 0
        )
        event_ops_at_risk = int(
            db.query(func.count(EventOperation.id))
            .filter(EventOperation.operational_status == EventOperation.OPERATIONAL_STATUS_AT_RISK)
            .scalar()
            or 0
        )

        deliveries_total = int(db.query(func.count(CommunicationDelivery.id)).scalar() or 0)
        deliveries_accepted = int(
            db.query(func.count(CommunicationDelivery.id))
            .filter(CommunicationDelivery.status == CommunicationDelivery.STATUS_ACCEPTED)
            .scalar()
            or 0
        )
        deliveries_failed = int(
            db.query(func.count(CommunicationDelivery.id))
            .filter(CommunicationDelivery.status == CommunicationDelivery.STATUS_FAILED)
            .scalar()
            or 0
        )
        deliveries_success_rate = (
            round((deliveries_accepted / deliveries_total) * 100, 2)
            if deliveries_total > 0
            else 0.0
        )

        automation_runs_total = int(db.query(func.count(AutomationRun.id)).scalar() or 0)
        automation_runs_failed = int(
            db.query(func.count(AutomationRun.id))
            .filter(AutomationRun.status == AutomationRun.STATUS_FAILED)
            .scalar()
            or 0
        )
        automation_failure_rate = (
            round((automation_runs_failed / automation_runs_total) * 100, 2)
            if automation_runs_total > 0
            else 0.0
        )

        participants_total = int(_base_participant_query(db).count() or 0)
        participants_checked_in = int(_base_participant_query(db).filter(Participant.checked_in.is_(True)).count() or 0)
        participant_check_in_rate = (
            round((participants_checked_in / participants_total) * 100, 2)
            if participants_total > 0
            else 0.0
        )

        aggregates = [
            ExecutiveDomainAggregateOut(
                domain="event_operations",
                metrics={
                    "total": event_ops_total,
                    "ready": event_ops_ready,
                    "at_risk": event_ops_at_risk,
                },
                calculated_at=calculated_at,
            ),
            ExecutiveDomainAggregateOut(
                domain="communications",
                metrics={
                    "deliveries_total": deliveries_total,
                    "deliveries_failed": deliveries_failed,
                    "deliveries_success_rate_percentage": deliveries_success_rate,
                },
                calculated_at=calculated_at,
            ),
            ExecutiveDomainAggregateOut(
                domain="automation",
                metrics={
                    "runs_total": automation_runs_total,
                    "runs_failed": automation_runs_failed,
                    "failure_rate_percentage": automation_failure_rate,
                },
                calculated_at=calculated_at,
            ),
            ExecutiveDomainAggregateOut(
                domain="participants",
                metrics={
                    "total": participants_total,
                    "checked_in": participants_checked_in,
                    "check_in_rate_percentage": participant_check_in_rate,
                },
                calculated_at=calculated_at,
            ),
        ]

        return ExecutiveSummaryOut(generated_at=calculated_at, aggregates=aggregates)
    except Exception:
        logger.exception("Executive summary projection failed; returning empty fallback")
        return ExecutiveSummaryOut(generated_at=calculated_at, aggregates=[])
