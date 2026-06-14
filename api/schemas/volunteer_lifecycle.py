from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class VolunteerProfileCreateIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str | None = None
    skills: list[str] | None = None
    certifications: list[str] | None = None
    notes: str | None = None


class VolunteerProfileLifecycleUpdateIn(BaseModel):
    lifecycle_status: str


class VolunteerProfileOut(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    lifecycle_status: str
    skills: list[str]
    certifications: list[str]
    notes: str | None = None
    is_active: bool
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VolunteerAvailabilityCreateIn(BaseModel):
    weekday: int | None = Field(default=None, ge=0, le=6)
    availability_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    availability_status: str = Field(default="available")
    notes: str | None = None


class VolunteerAvailabilityOut(BaseModel):
    id: UUID
    volunteer_id: UUID
    weekday: int | None = None
    availability_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    availability_status: str
    notes: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VolunteerAssignmentCreateIn(BaseModel):
    volunteer_id: UUID
    event_id: UUID
    session_id: UUID | None = None
    assignment_role: str = Field(min_length=2, max_length=120)
    notes: str | None = None


class VolunteerAssignmentOut(BaseModel):
    id: UUID
    volunteer_id: UUID
    event_id: UUID
    session_id: UUID | None = None
    assignment_role: str
    status: str
    notes: str | None = None
    assigned_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)