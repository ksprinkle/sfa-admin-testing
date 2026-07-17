from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session, joinedload

from api.models.admin_audit_events import AdminAuditEvent
from api.models.users import User
from api.ws_manager import manager

# Domain:action combinations meaningful enough to justify a live WebSocket refresh
# ping to Notification Center. Mirrors the frontend's own audit-event allowlist
# (AUDIT_NOTIFICATION_RULES in admin-app/src/App.jsx) — keep the two in sync, since
# anything not here still reaches Notification Center via its regular interval poll,
# just without the live nudge.
NOTABLE_AUDIT_EVENTS = {
    ("permissions", "user_role_updated"),
    ("participants", "assign_session"),
    ("participants", "promote_waitlist"),
    ("event_operations", "event_operational_status_updated"),
    ("communications", "template_created"),
    ("communications", "template_active_state_updated"),
    ("communications", "message_deleted"),
    ("automation", "workflow_created"),
    ("automation", "workflow_enabled_updated"),
    ("automation", "workflow_execution_completed"),
    ("volunteer", "volunteer_lifecycle_updated"),
    ("volunteer", "volunteer_assignment_created"),
    ("volunteer", "volunteer_assignment_cancelled"),
}


def record_admin_audit_event(
    db: Session,
    *,
    domain: str,
    action: str,
    actor_user_id: str | None,
    target_type: str | None = None,
    target_id: str | None = None,
    target_display: str | None = None,
    source: str | None = "admin_api",
    details: dict[str, Any] | None = None,
) -> None:
    normalized_domain = domain.strip().lower()
    normalized_action = action.strip().lower()

    db.add(
        AdminAuditEvent(
            domain=normalized_domain,
            action=normalized_action,
            actor_user_id=actor_user_id,
            target_type=(target_type or "").strip().lower() or None,
            target_id=target_id,
            target_display=target_display,
            source=source,
            details=details,
        )
    )

    if (normalized_domain, normalized_action) in NOTABLE_AUDIT_EVENTS:
        _broadcast_audit_event_ping()


def _broadcast_audit_event_ping() -> None:
    # Best-effort live-refresh signal — a failed or skipped broadcast must never affect
    # audit logging itself. Every router that reaches this function today uses a sync
    # `def` handler (no running event loop in that worker thread), so this mirrors the
    # dual-mode await/asyncio.run pattern already used for participant_update broadcasts
    # in api/routers/admin_participants.py: schedule on the running loop if there is one,
    # otherwise spin a short-lived one.
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None:
        loop.create_task(_send_audit_event_ping())
        return

    try:
        asyncio.run(_send_audit_event_ping())
    except Exception:
        pass


async def _send_audit_event_ping() -> None:
    try:
        await manager.broadcast(json.dumps({"type": "audit_event"}))
    except Exception:
        pass


def list_admin_audit_events(
    db: Session,
    *,
    domain: str | None = None,
    action: str | None = None,
    actor_user_id: str | None = None,
    actor_email: str | None = None,
    target_type: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AdminAuditEvent], int]:
    query = db.query(AdminAuditEvent).options(joinedload(AdminAuditEvent.actor))

    if domain:
        query = query.filter(AdminAuditEvent.domain == domain.strip().lower())
    if action:
        query = query.filter(AdminAuditEvent.action == action.strip().lower())
    if actor_user_id:
        query = query.filter(AdminAuditEvent.actor_user_id == actor_user_id)
    if actor_email:
        # .has() compiles to a correlated EXISTS, kept separate from the
        # joinedload above so eager-loading and filtering never collide.
        query = query.filter(
            AdminAuditEvent.actor.has(User.email.ilike(f"%{actor_email.strip()}%"))
        )
    if target_type:
        query = query.filter(AdminAuditEvent.target_type == target_type.strip().lower())
    if created_from:
        query = query.filter(AdminAuditEvent.created_at >= created_from)
    if created_to:
        query = query.filter(AdminAuditEvent.created_at <= created_to)

    total = query.count()
    items = (
        query.order_by(AdminAuditEvent.created_at.desc(), AdminAuditEvent.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return items, total