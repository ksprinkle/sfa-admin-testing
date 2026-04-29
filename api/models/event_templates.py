import uuid

from sqlalchemy import JSON, Column, Date, DateTime, Integer, String, Time, Boolean, Float, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from db.base import Base


class EventTemplate(Base):
    __tablename__ = "event_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    capacity = Column(Integer, nullable=False)
    event_type = Column(String, nullable=False)
    date = Column(Date, nullable=True)
    default_start_time = Column(Time, nullable=False)
    default_end_time = Column(Time, nullable=False)
    session_count = Column(Integer, nullable=False)
    session_capacity = Column(Integer, nullable=False)
    schedule_rule_type = Column(String, nullable=False, default="nth_weekday")
    schedule_months = Column(JSON, nullable=False, default=lambda: [5, 6, 7, 8, 9])
    schedule_weekday = Column(Integer, nullable=False, default=5)
    schedule_week_numbers = Column(JSON, nullable=False, default=lambda: [2, 3])
    volunteer_capacity = Column(Integer, nullable=True)
    featured_image = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    beach_accessibility = Column(Boolean, default=True)
    beach_access_notes = Column(Text, nullable=True)
    directions = Column(Text, nullable=True)
    parking_info = Column(Text, nullable=True)
    lodging_info = Column(Text, nullable=True)
    map_url = Column(String, nullable=True)
    weather_report_url = Column(String, nullable=True)
    surf_report_url = Column(String, nullable=True)
    internal_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)