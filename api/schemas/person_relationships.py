from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PersonRelationshipCreate(BaseModel):
    subject_person_id: UUID
    related_person_id: UUID
    relationship_type: str
    can_register_for: bool = False
    can_view_documents: bool = False
    can_manage_documents: bool = False
    can_receive_communications: bool = False
    is_emergency_contact_only: bool = False


class PersonRelationshipOut(BaseModel):
    id: UUID
    subject_person_id: UUID
    related_person_id: UUID
    relationship_type: str
    can_register_for: bool
    can_view_documents: bool
    can_manage_documents: bool
    can_receive_communications: bool
    is_emergency_contact_only: bool
    household_id: UUID | None = None
    status: str
    verified_at: datetime | None = None
    verified_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
