from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_admin
from api.schemas.admin_audit import AdminAuditEventListOut
from api.services.admin_audit import list_admin_audit_events


router = APIRouter(
    prefix="/admin/audit",
    tags=["Admin Audit"],
)


@router.get("/events", response_model=AdminAuditEventListOut)
def get_admin_audit_events(
    domain: str | None = None,
    action: str | None = None,
    actor_user_id: str | None = None,
    actor_email: str | None = None,
    target_type: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    items, total = list_admin_audit_events(
        db,
        domain=domain,
        action=action,
        actor_user_id=actor_user_id,
        actor_email=actor_email,
        target_type=target_type,
        created_from=created_from,
        created_to=created_to,
        limit=limit,
        offset=offset,
    )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": items,
    }