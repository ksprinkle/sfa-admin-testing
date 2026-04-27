import uuid

from sqlalchemy import JSON, Column, DateTime, Integer, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from api.db.base import Base


class EventTemplate(Base):
    __tablename__ = "event_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    capacity = Column(Integer, nullable=False)
    event_type = Column(String, nullable=False)
    default_start_time = Column(Time, nullable=False)
    default_end_time = Column(Time, nullable=False)
    session_count = Column(Integer, nullable=False)
    session_capacity = Column(Integer, nullable=False)
    schedule_rule_type = Column(String, nullable=False, default="nth_weekday")
    schedule_months = Column(JSON, nullable=False, default=lambda: [5, 6, 7, 8, 9])
    schedule_weekday = Column(Integer, nullable=False, default=5)
    schedule_week_numbers = Column(JSON, nullable=False, default=lambda: [2, 3])
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)