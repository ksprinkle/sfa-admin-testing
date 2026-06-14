from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WaiverTemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    supersedes_template_id: UUID | None = None


class WaiverTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1)


class WaiverTemplateActivateIn(BaseModel):
    supersedes_template_id: UUID | None = None


class WaiverTemplateOut(BaseModel):
    id: UUID
    title: str
    version: int
    status: str
    content: str
    supersedes_template_id: UUID | None = None
    created_by_user_id: str | None = None
    activated_by_user_id: str | None = None
    archived_by_user_id: str | None = None
    activated_at: datetime | None = None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WaiverTemplatePreviewOut(BaseModel):
    id: UUID
    title: str
    version: int
    status: str
    content: str

    model_config = ConfigDict(from_attributes=True)
