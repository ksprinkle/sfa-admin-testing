from datetime import date, datetime, time
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EventTemplateBase(BaseModel):
    name: str = Field(min_length=1)
    location: str = Field(min_length=1)
    capacity: int = Field(ge=1)
    event_type: str = Field(min_length=1)
    default_start_time: time
    default_end_time: time
    session_count: int = Field(ge=1)
    session_capacity: int = Field(ge=1)


class EventTemplateCreate(EventTemplateBase):
    pass


class EventTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    location: Optional[str] = Field(default=None, min_length=1)
    capacity: Optional[int] = Field(default=None, ge=1)
    event_type: Optional[str] = Field(default=None, min_length=1)
    default_start_time: Optional[time] = None
    default_end_time: Optional[time] = None
    session_count: Optional[int] = Field(default=None, ge=1)
    session_capacity: Optional[int] = Field(default=None, ge=1)


class EventTemplateOut(EventTemplateBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CreateEventFromTemplateIn(BaseModel):
    date: date