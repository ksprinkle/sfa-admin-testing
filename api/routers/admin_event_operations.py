from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_permission
from api.schemas.event_operations import (
    EventOperationsOut,
    EventOperationsRefreshIn,
    EventOperationsStatusUpdateIn,
)
from api.services.authorization import PERMISSION_EVENT_OPERATIONS_MANAGE
from api.services.event_operations import (
    get_event_operations,
    list_event_operations,
    refresh_event_operations,
    set_event_operational_status,
)


router = APIRouter(prefix="/admin/event-operations", tags=["Admin Event Operations"])


@router.get("", response_model=list[EventOperationsOut])
def get_event_operations_list(
    operational_status: str | None = None,
    readiness_status: str | None = None,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_EVENT_OPERATIONS_MANAGE)),
):
    return list_event_operations(
        db,
        operational_status=operational_status,
        readiness_status=readiness_status,
    )


@router.get("/{event_id}", response_model=EventOperationsOut)
def get_event_operations_details(
    event_id: UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_EVENT_OPERATIONS_MANAGE)),
):
    return get_event_operations(db, event_id=event_id)


@router.post("/{event_id}/refresh", response_model=EventOperationsOut)
def refresh_event_operations_details(
    event_id: UUID,
    payload: EventOperationsRefreshIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_EVENT_OPERATIONS_MANAGE)),
):
    return refresh_event_operations(
        db,
        event_id=event_id,
        actor_user_id=current_user.id,
        additional_blockers=payload.additional_blockers,
    )


@router.put("/{event_id}/status", response_model=EventOperationsOut)
def update_event_operations_status(
    event_id: UUID,
    payload: EventOperationsStatusUpdateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_EVENT_OPERATIONS_MANAGE)),
):
    return set_event_operational_status(
        db,
        event_id=event_id,
        operational_status=payload.operational_status,
        notes=payload.notes,
        actor_user_id=current_user.id,
    )