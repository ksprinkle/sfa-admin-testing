from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, UTC
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.automation_runs import AutomationRun
from api.models.automation_workflows import AutomationWorkflow
from api.services.admin_audit import record_admin_audit_event


AutomationHandler = Callable[[Session, AutomationWorkflow, dict[str, Any]], dict[str, Any] | None]

_WORKFLOW_REGISTRY: dict[str, AutomationHandler] = {}


def register_workflow_handler(workflow_key: str, handler: AutomationHandler) -> None:
    key = workflow_key.strip().lower()
    _WORKFLOW_REGISTRY[key] = handler


def list_registered_workflow_keys() -> list[str]:
    return sorted(_WORKFLOW_REGISTRY.keys())


def register_default_workflow_handlers() -> None:
    if "system.noop" not in _WORKFLOW_REGISTRY:
        register_workflow_handler("system.noop", _noop_handler)


def _noop_handler(_db: Session, workflow: AutomationWorkflow, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "handler": "system.noop",
        "workflow_key": workflow.workflow_key,
        "accepted_payload": payload,
    }


def create_workflow(
    db: Session,
    *,
    workflow_key: str,
    name: str,
    trigger_type: str,
    target_domain: str,
    action: str,
    config: dict[str, Any] | None,
    actor_user_id: str | None,
) -> AutomationWorkflow:
    normalized_key = workflow_key.strip().lower()
    existing = (
        db.query(AutomationWorkflow)
        .filter(AutomationWorkflow.workflow_key == normalized_key)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Workflow key already exists")

    workflow = AutomationWorkflow(
        workflow_key=normalized_key,
        name=name,
        trigger_type=trigger_type.strip().lower(),
        target_domain=target_domain.strip().lower(),
        action=action.strip().lower(),
        config=config,
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    db.add(workflow)

    record_admin_audit_event(
        db,
        domain="automation",
        action="workflow_created",
        actor_user_id=actor_user_id,
        target_type="workflow",
        target_display=normalized_key,
        source="admin.automation.workflows.create",
        details={
            "trigger_type": workflow.trigger_type,
            "target_domain": workflow.target_domain,
            "action": workflow.action,
            "is_enabled": workflow.is_enabled,
        },
    )

    db.commit()
    db.refresh(workflow)
    return workflow


def list_workflows(db: Session) -> list[AutomationWorkflow]:
    return (
        db.query(AutomationWorkflow)
        .order_by(AutomationWorkflow.created_at.desc(), AutomationWorkflow.workflow_key.asc())
        .all()
    )


def set_workflow_enabled(
    db: Session,
    *,
    workflow_id: UUID,
    enabled: bool,
    actor_user_id: str | None,
) -> AutomationWorkflow:
    workflow = db.query(AutomationWorkflow).filter(AutomationWorkflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    previous = workflow.is_enabled
    workflow.is_enabled = enabled
    workflow.updated_by_user_id = actor_user_id
    workflow.updated_at = datetime.now(UTC).replace(tzinfo=None)

    record_admin_audit_event(
        db,
        domain="automation",
        action="workflow_enabled_updated",
        actor_user_id=actor_user_id,
        target_type="workflow",
        target_id=str(workflow.id),
        target_display=workflow.workflow_key,
        source="admin.automation.workflows.enable",
        details={
            "previous_enabled": previous,
            "new_enabled": enabled,
        },
    )

    db.commit()
    db.refresh(workflow)
    return workflow


def execute_workflow(
    db: Session,
    *,
    workflow_id: UUID,
    actor_user_id: str | None,
    trigger_source: str,
    payload: dict[str, Any] | None,
) -> AutomationRun:
    workflow = db.query(AutomationWorkflow).filter(AutomationWorkflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not workflow.is_enabled:
        raise HTTPException(status_code=409, detail="Workflow is disabled")

    run = AutomationRun(
        workflow_id=workflow.id,
        trigger_source=trigger_source.strip().lower(),
        status=AutomationRun.STATUS_RUNNING,
        trigger_payload=payload,
        initiated_by_user_id=actor_user_id,
        started_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(run)
    db.flush()

    record_admin_audit_event(
        db,
        domain="automation",
        action="workflow_execution_started",
        actor_user_id=actor_user_id,
        target_type="workflow",
        target_id=str(workflow.id),
        target_display=workflow.workflow_key,
        source="admin.automation.workflows.execute",
        details={
            "run_id": str(run.id),
            "trigger_source": run.trigger_source,
        },
    )

    handler = _WORKFLOW_REGISTRY.get(workflow.workflow_key)
    if not handler:
        run.status = AutomationRun.STATUS_FAILED
        run.error_message = "No handler registered for workflow key"
        run.completed_at = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
        db.refresh(run)
        return run

    try:
        result = handler(db, workflow, payload or {})
        run.status = AutomationRun.STATUS_SUCCEEDED
        run.result_payload = result
        run.completed_at = datetime.now(UTC).replace(tzinfo=None)
    except Exception as exc:
        run.status = AutomationRun.STATUS_FAILED
        run.error_message = str(exc)
        run.completed_at = datetime.now(UTC).replace(tzinfo=None)

    record_admin_audit_event(
        db,
        domain="automation",
        action="workflow_execution_completed",
        actor_user_id=actor_user_id,
        target_type="workflow",
        target_id=str(workflow.id),
        target_display=workflow.workflow_key,
        source="admin.automation.workflows.execute",
        details={
            "run_id": str(run.id),
            "status": run.status,
        },
    )

    db.commit()
    db.refresh(run)
    return run


def list_workflow_runs(db: Session, *, workflow_id: UUID | None = None, limit: int = 50) -> list[AutomationRun]:
    query = db.query(AutomationRun)
    if workflow_id:
        query = query.filter(AutomationRun.workflow_id == workflow_id)
    return query.order_by(AutomationRun.created_at.desc()).limit(limit).all()
