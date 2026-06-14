from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from api.models.admin_audit_events import AdminAuditEvent


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
    db.add(
        AdminAuditEvent(
            domain=domain.strip().lower(),
            action=action.strip().lower(),
            actor_user_id=actor_user_id,
            target_type=(target_type or "").strip().lower() or None,
            target_id=target_id,
            target_display=target_display,
            source=source,
            details=details,
        )
    )


def list_admin_audit_events(
    db: Session,
    *,
    domain: str | None = None,
    action: str | None = None,
    actor_user_id: str | None = None,
    target_type: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AdminAuditEvent], int]:
    query = db.query(AdminAuditEvent)

    if domain:
        query = query.filter(AdminAuditEvent.domain == domain.strip().lower())
    if action:
        query = query.filter(AdminAuditEvent.action == action.strip().lower())
    if actor_user_id:
        query = query.filter(AdminAuditEvent.actor_user_id == actor_user_id)
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