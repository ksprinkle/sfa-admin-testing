from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AutomationWorkflowCreateIn(BaseModel):
    workflow_key: str = Field(min_length=3, max_length=120)
    name: str = Field(min_length=3, max_length=200)
    trigger_type: str = Field(default="manual")
    target_domain: str = Field(min_length=2, max_length=100)
    action: str = Field(min_length=2, max_length=100)
    config: dict | None = None


class AutomationWorkflowSetEnabledIn(BaseModel):
    enabled: bool


class AutomationWorkflowOut(BaseModel):
    id: UUID
    workflow_key: str
    name: str
    trigger_type: str
    target_domain: str
    action: str
    is_enabled: bool
    config: dict | None = None
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AutomationWorkflowExecuteIn(BaseModel):
    trigger_source: str = Field(default="manual_api", min_length=3, max_length=100)
    payload: dict | None = None


class AutomationRunOut(BaseModel):
    id: UUID
    workflow_id: UUID
    trigger_source: str
    status: str
    trigger_payload: dict | None = None
    result_payload: dict | None = None
    error_message: str | None = None
    initiated_by_user_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)