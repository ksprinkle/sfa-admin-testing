from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_permission
from api.schemas.automation import (
    AutomationRunOut,
    AutomationWorkflowCreateIn,
    AutomationWorkflowExecuteIn,
    AutomationWorkflowOut,
    AutomationWorkflowSetEnabledIn,
)
from api.services.authorization import PERMISSION_AUTOMATION_MANAGE
from api.services.automation_engine import (
    create_workflow,
    execute_workflow,
    list_registered_workflow_keys,
    list_workflow_runs,
    list_workflows,
    set_workflow_enabled,
)


router = APIRouter(
    prefix="/admin/automation",
    tags=["Admin Automation"],
)


@router.get("/registry")
def get_registry_keys(_current_user=Depends(require_permission(PERMISSION_AUTOMATION_MANAGE))):
    return {"workflow_keys": list_registered_workflow_keys()}


@router.post("/workflows", response_model=AutomationWorkflowOut, status_code=201)
def create_automation_workflow(
    payload: AutomationWorkflowCreateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_AUTOMATION_MANAGE)),
):
    return create_workflow(
        db,
        workflow_key=payload.workflow_key,
        name=payload.name,
        trigger_type=payload.trigger_type,
        target_domain=payload.target_domain,
        action=payload.action,
        config=payload.config,
        actor_user_id=current_user.id,
    )


@router.get("/workflows", response_model=list[AutomationWorkflowOut])
def get_automation_workflows(
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_AUTOMATION_MANAGE)),
):
    return list_workflows(db)


@router.put("/workflows/{workflow_id}/enabled", response_model=AutomationWorkflowOut)
def set_automation_workflow_enabled(
    workflow_id: UUID,
    payload: AutomationWorkflowSetEnabledIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_AUTOMATION_MANAGE)),
):
    return set_workflow_enabled(
        db,
        workflow_id=workflow_id,
        enabled=payload.enabled,
        actor_user_id=current_user.id,
    )


@router.post("/workflows/{workflow_id}/execute", response_model=AutomationRunOut, status_code=202)
def execute_automation_workflow(
    workflow_id: UUID,
    payload: AutomationWorkflowExecuteIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_AUTOMATION_MANAGE)),
):
    return execute_workflow(
        db,
        workflow_id=workflow_id,
        actor_user_id=current_user.id,
        trigger_source=payload.trigger_source,
        payload=payload.payload,
    )


@router.get("/runs", response_model=list[AutomationRunOut])
def get_automation_runs(
    workflow_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_AUTOMATION_MANAGE)),
):
    return list_workflow_runs(db, workflow_id=workflow_id, limit=limit)