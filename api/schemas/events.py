from pydantic import BaseModel
from datetime import date, time
from uuid import UUID
from typing import Optional


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
    vendor_open: bool

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

    featured_image: Optional[str]

    registration: EventRegistration
    availability: EventAvailability
    featured_image: Optional[str]

class Config:
        from_attributes = True 

class EventCreate(BaseModel):
    title: str
    slug: str
    event_type: str
    status: str = "draft"

    start_date: date
    end_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    timezone: str = "America/New_York"

    venue: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    beach_accessibility: bool = True

    participant_capacity: Optional[int] = None
    volunteer_capacity: Optional[int] = None

    participant_open: bool = False
    volunteer_open: bool = False
    vendor_open: bool = False

    featured_image: Optional[str] = None
    
class EventUpdate(BaseModel):
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
    vendor_open: Optional[bool] = None

    featured_image: Optional[str] = None
