from pydantic import BaseModel
from datetime import date, time
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
    volunteers: Optional[int]


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

    participant_capacity: Optional[int] = None
    volunteer_capacity: Optional[int] = None

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

    @model_validator(mode="before")
    @classmethod
    def map_legacy_vendor_field(cls, data):
        if isinstance(data, dict):
            if "exhibitor_open" not in data and "vendor_open" in data:
                data["exhibitor_open"] = data["vendor_open"]
        return data
    
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
    
    participant_open: bool = False
    volunteer_open: bool = False
    exhibitor_open: bool = False
    website_schedule_published: bool = False

    featured_image: Optional[str] = None
    
class EventUpdate(EventBase):
    pass

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
    
    participant_count: int
    waitlist_count: int
    checked_in_count: int
    waivers_missing: int
    
    participant_capacity: Optional[int]
    participant_remaining: Optional[int]
    participant_fill_percent: Optional[float]
    
    volunteer_count: int
    volunteer_capacity: Optional[int]
    volunteer_remaining: Optional[int]
    volunteer_fill_percent: Optional[float]

    class Config:
        from_attributes = True
