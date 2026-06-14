from pydantic import BaseModel, Field
from datetime import date, datetime, time
from uuid import UUID
from typing import Optional
from pydantic import field_validator, model_validator

class EventLocation(BaseModel):
    venue: Optional[str]
    city: Optional[str]
    state: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    beach_accessibility: bool


class EventCapacity(BaseModel):
    participants: Optional[int]
    volunteers: Optional[int] = Field(
        default=None,
        description="Informational only for now. Volunteer limits are currently not enforced.",
    )


class EventRegistration(BaseModel):
    participant_open: bool
    volunteer_open: bool
    exhibitor_open: bool

class EventAvailability(BaseModel):
    participant_available: bool
    volunteer_available: bool
 

class EventOut(BaseModel):
    id: UUID
    title: str
    slug: str
    event_type: str
    status: str
    start_date: date
    end_date: Optional[date]
    start_time: Optional[time]
    end_time: Optional[time]
    timezone: str
    location: EventLocation
    capacity: EventCapacity
    registration: EventRegistration
    availability: EventAvailability
    website_schedule_published: bool = False
    beach_access_notes: Optional[str] = None
    directions: Optional[str] = None
    parking_info: Optional[str] = None
    lodging_info: Optional[str] = None
    map_url: Optional[str] = None
    weather_report_url: Optional[str] = None
    surf_report_url: Optional[str] = None

    featured_image: Optional[str] = None
    no_show_minutes: Optional[int] = None

class EventListOut(BaseModel):
    id: UUID
    title: str
    slug: str
    event_type: str
    status: str
    start_date: date
    end_date: Optional[date]
    start_time: Optional[time]
    end_time: Optional[time]
    timezone: str
    location: EventLocation
    
    participant_count: int
    participant_capacity: Optional[int]
    participant_available: bool

    class Config:
        from_attributes = True 

class EventBase(BaseModel):
    template_id: Optional[UUID] = None
    title: Optional[str] = None
    event_type: Optional[str] = None
    status: Optional[str] = None

    start_date: Optional[date] = None
    end_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    timezone: Optional[str] = None

    venue: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    beach_accessibility: Optional[bool] = None
    beach_access_notes: Optional[str] = None
    directions: Optional[str] = None
    parking_info: Optional[str] = None
    lodging_info: Optional[str] = None
    map_url: Optional[str] = None
    weather_report_url: Optional[str] = None
    surf_report_url: Optional[str] = None
    internal_notes: Optional[str] = None

    participant_capacity: Optional[int] = None
    volunteer_capacity: Optional[int] = Field(
        default=None,
        description="Informational only for now. Volunteer limits are currently not enforced.",
    )

    participant_open: Optional[bool] = None
    volunteer_open: Optional[bool] = None
    exhibitor_open: Optional[bool] = None
    website_schedule_published: Optional[bool] = None

    featured_image: Optional[str] = None
    no_show_minutes: Optional[int] = None

    @field_validator("participant_capacity", "volunteer_capacity")
    @classmethod
    def convert_zero_to_none(cls, v):
        if v == 0:
            return None
        return v

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, value):
        if value is None:
            return value
        if value < -90 or value > 90:
            raise ValueError("Latitude must be between -90 and 90")
        return value

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, value):
        if value is None:
            return value
        if value < -180 or value > 180:
            raise ValueError("Longitude must be between -180 and 180")
        return value

    @model_validator(mode="before")
    @classmethod
    def map_legacy_vendor_field(cls, data):
        if isinstance(data, dict):
            if "exhibitor_open" not in data and "vendor_open" in data:
                data["exhibitor_open"] = data["vendor_open"]
        return data

    @model_validator(mode="after")
    def validate_event_timing(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("End date cannot be earlier than start date")

        same_day_event = (
            self.start_time
            and self.end_time
            and (
                self.end_date is None
                or self.start_date is None
                or self.end_date == self.start_date
            )
        )

        if same_day_event and self.end_time < self.start_time:
            raise ValueError("End time cannot be earlier than start time for a same-day event")

        return self
    
class EventCreate(EventBase):
    title: str
    event_type: str
    start_date: date

    status: str = "draft"
    timezone: str = "America/New_York"

    beach_accessibility: bool = True

    participant_open: bool = False
    volunteer_open: bool = False
    exhibitor_open: bool = False
    website_schedule_published: bool = False

    no_show_minutes: Optional[int] = 15

    @field_validator("participant_capacity", "volunteer_capacity")
    @classmethod
    def convert_zero_to_none(cls, v):
        if v == 0:
            return None
        return v


class EventUpdate(EventBase):
    @field_validator("participant_capacity", "volunteer_capacity")
    @classmethod
    def convert_zero_to_none(cls, v):
        if v == 0:
            return None
        return v
    
    participant_open: Optional[bool] = None
    volunteer_open: Optional[bool] = None
    exhibitor_open: Optional[bool] = None
    website_schedule_published: Optional[bool] = None

    featured_image: Optional[str] = None
    no_show_minutes: Optional[int] = None

from uuid import UUID
from datetime import date, time
from typing import Optional


class AdminEventListOut(BaseModel):
    id: UUID
    title: str
    slug: str
    event_type: str
    status: str

    start_date: date
    end_date: Optional[date]
    start_time: Optional[time]
    end_time: Optional[time]
    timezone: str

    location: EventLocation
    capacity: EventCapacity
    registration: EventRegistration
    availability: EventAvailability
    website_schedule_published: bool = False
    beach_access_notes: Optional[str] = None
    directions: Optional[str] = None
    parking_info: Optional[str] = None
    lodging_info: Optional[str] = None
    map_url: Optional[str] = None
    weather_report_url: Optional[str] = None
    surf_report_url: Optional[str] = None
    internal_notes: Optional[str] = None
    sessions: list = []
    featured_image: Optional[str]

    participant_count: int
    waitlist_count: int
    checked_in_count: int

    class Config:
        from_attributes = True

from pydantic import BaseModel
from uuid import UUID
from typing import Optional


class AdminEventSummary(BaseModel):
    event_id: UUID
    title: str
    status: str
    
    registered_count: int
    cleared_to_participate_count: int
    participant_count: int
    waitlist_count: int
    checked_in_count: int
    waivers_missing: int
    waivers_sent_count: int = 0
    waivers_viewed_count: int = 0
    waivers_signed_count: int = 0
    expired_links_count: int = 0
    email_deliveries_count: int = 0
    sms_deliveries_count: int = 0
    failed_deliveries_count: int = 0
    
    participant_capacity: Optional[int]
    participant_remaining: Optional[int]
    participant_fill_percent: Optional[float]
    
    volunteer_count: int
    volunteer_capacity: Optional[int]
    volunteer_remaining: Optional[int]
    volunteer_fill_percent: Optional[float]
    volunteer_type_counts: dict[str, int]
    volunteer_group_counts: dict[str, int]
    volunteer_flexible_group_counts: dict[str, int]
    versatile_volunteer_count: int

    class Config:
        from_attributes = True


class EventActionIn(BaseModel):
    reason_code: Optional[str] = None
    reason_note: Optional[str] = None


class EventActivityLogOut(BaseModel):
    id: UUID
    event_id: str
    event_title: str
    event_type: Optional[str] = None
    action_type: str
    previous_status: Optional[str] = None
    new_status: Optional[str] = None
    reason_code: Optional[str] = None
    reason_note: Optional[str] = None
    actor_user_id: Optional[str] = None
    actor_user_email: Optional[str] = None
    participant_count: Optional[int] = None
    waitlist_count: Optional[int] = None
    checked_in_count: Optional[int] = None
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }
