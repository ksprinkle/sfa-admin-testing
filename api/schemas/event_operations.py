from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EventOperationsRefreshIn(BaseModel):
    additional_blockers: list[str] | None = None


class EventOperationsStatusUpdateIn(BaseModel):
    operational_status: str
    notes: str | None = None


class EventOperationsOut(BaseModel):
    id: UUID
    event_id: UUID
    operational_status: str
    readiness_status: str
    capacity_status: str
    participant_capacity: int | None = None
    participant_count: int
    volunteer_capacity: int | None = None
    volunteer_assignment_count: int
    readiness_score: float
    blockers: list[str]
    notes: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)