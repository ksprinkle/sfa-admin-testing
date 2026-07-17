from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CommunicationTemplateCreateIn(BaseModel):
    template_key: str = Field(min_length=3, max_length=120)
    name: str = Field(min_length=3, max_length=200)
    channel: str = Field(default="email")
    subject_template: str | None = None
    body_template: str = Field(min_length=1)


class CommunicationTemplateSetActiveIn(BaseModel):
    is_active: bool


class CommunicationTemplateOut(BaseModel):
    id: UUID
    template_key: str
    name: str
    channel: str
    subject_template: str | None = None
    body_template: str
    is_active: bool
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CommunicationMessageCreateIn(BaseModel):
    template_id: UUID | None = None
    channel: str = Field(default="email")
    audience_type: str = Field(default="manual")
    audience_filter: dict | None = None
    subject: str | None = None
    body: str = Field(min_length=1)


class CommunicationMessageUpdateIn(BaseModel):
    subject: str | None = None
    body: str | None = Field(default=None, min_length=1)


class CommunicationMessageOut(BaseModel):
    id: UUID
    template_id: UUID | None = None
    channel: str
    audience_type: str
    audience_filter: dict | None = None
    subject: str | None = None
    body: str
    status: str
    created_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CommunicationDeliveryCreateIn(BaseModel):
    recipient: str = Field(min_length=3, max_length=300)
    provider_key: str = Field(default="noop")


class CommunicationDeliveryOut(BaseModel):
    id: UUID
    message_id: UUID
    channel: str
    recipient: str
    provider_key: str
    provider_message_id: str | None = None
    status: str
    error_message: str | None = None
    metadata_json: dict | None = None
    created_by_user_id: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)