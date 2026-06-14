from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AdminAuditEventOut(BaseModel):
    id: UUID
    domain: str
    action: str
    actor_user_id: str | None = None
    target_type: str | None = None
    target_id: str | None = None
    target_display: str | None = None
    source: str | None = None
    details: dict | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminAuditEventListOut(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[AdminAuditEventOut]