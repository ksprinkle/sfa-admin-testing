from datetime import date as date_value, datetime, time
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EventTemplateBase(BaseModel):
    name: str = Field(min_length=1)
    location: str = Field(min_length=1)
    capacity: int = Field(ge=1)
    event_type: str = Field(min_length=1)
    date: Optional[date_value] = None
    default_start_time: time
    default_end_time: time
    session_count: int = Field(ge=1)
    session_capacity: int = Field(ge=1)
    schedule_rule_type: str = Field(default="nth_weekday", min_length=1)
    schedule_months: list[int] = Field(default_factory=lambda: [5, 6, 7, 8, 9])
    schedule_weekday: int = Field(default=5, ge=0, le=6)
    schedule_week_numbers: list[int] = Field(default_factory=lambda: [2, 3])
    volunteer_capacity: Optional[int] = Field(default=None, ge=0)
    featured_image: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    beach_accessibility: bool = Field(default=True)
    beach_access_notes: Optional[str] = None
    directions: Optional[str] = None
    parking_info: Optional[str] = None
    lodging_info: Optional[str] = None
    map_url: Optional[str] = None
    weather_report_url: Optional[str] = None
    surf_report_url: Optional[str] = None
    internal_notes: Optional[str] = None

    @field_validator("schedule_rule_type")
    @classmethod
    def validate_rule_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized != "nth_weekday":
            raise ValueError("Only 'nth_weekday' schedule_rule_type is supported")
        return normalized

    @field_validator("schedule_months")
    @classmethod
    def validate_months(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("schedule_months cannot be empty")
        for month in value:
            if month < 1 or month > 12:
                raise ValueError("schedule_months values must be between 1 and 12")
        return value

    @field_validator("schedule_week_numbers")
    @classmethod
    def validate_week_numbers(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("schedule_week_numbers cannot be empty")
        for week_number in value:
            if week_number < 1 or week_number > 5:
                raise ValueError("schedule_week_numbers values must be between 1 and 5")
        return value


class EventTemplateCreate(EventTemplateBase):
    pass


class EventTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    location: Optional[str] = Field(default=None, min_length=1)
    capacity: Optional[int] = Field(default=None, ge=1)
    event_type: Optional[str] = Field(default=None, min_length=1)
    date: Optional[date_value] = None
    default_start_time: Optional[time] = None
    default_end_time: Optional[time] = None
    session_count: Optional[int] = Field(default=None, ge=1)
    session_capacity: Optional[int] = Field(default=None, ge=1)
    schedule_rule_type: Optional[str] = Field(default=None, min_length=1)
    schedule_months: Optional[list[int]] = None
    schedule_weekday: Optional[int] = Field(default=None, ge=0, le=6)
    schedule_week_numbers: Optional[list[int]] = None
    volunteer_capacity: Optional[int] = Field(default=None, ge=0)
    featured_image: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    beach_accessibility: Optional[bool] = None
    beach_access_notes: Optional[str] = None
    directions: Optional[str] = None
    parking_info: Optional[str] = None
    lodging_info: Optional[str] = None
    map_url: Optional[str] = None
    weather_report_url: Optional[str] = None
    surf_report_url: Optional[str] = None
    internal_notes: Optional[str] = None

    @field_validator("schedule_rule_type")
    @classmethod
    def validate_optional_rule_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized != "nth_weekday":
            raise ValueError("Only 'nth_weekday' schedule_rule_type is supported")
        return normalized

    @field_validator("schedule_months")
    @classmethod
    def validate_optional_months(cls, value: Optional[list[int]]) -> Optional[list[int]]:
        if value is None:
            return value
        if not value:
            raise ValueError("schedule_months cannot be empty")
        for month in value:
            if month < 1 or month > 12:
                raise ValueError("schedule_months values must be between 1 and 12")
        return value

    @field_validator("schedule_week_numbers")
    @classmethod
    def validate_optional_week_numbers(cls, value: Optional[list[int]]) -> Optional[list[int]]:
        if value is None:
            return value
        if not value:
            raise ValueError("schedule_week_numbers cannot be empty")
        for week_number in value:
            if week_number < 1 or week_number > 5:
                raise ValueError("schedule_week_numbers values must be between 1 and 5")
        return value


class EventTemplateOut(EventTemplateBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CreateEventFromTemplateIn(BaseModel):
    date: date_value


class GenerateAnnualEventsFromTemplateIn(BaseModel):
    year: int = Field(ge=2000, le=2100)
    preview: bool = False


class GenerateAnnualEventsFromTemplateOut(BaseModel):
    created: int
    skipped: int
    dates: list[date_value]


class GenerateAnnualPreviewDateOut(BaseModel):
    date: date_value
    exists: bool


class GenerateAnnualPreviewOut(BaseModel):
    preview: bool = True
    year: int
    dates: list[GenerateAnnualPreviewDateOut]