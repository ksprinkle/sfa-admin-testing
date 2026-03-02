import uuid
from sqlalchemy import Column, String, Date, Time, Boolean, Integer, Float, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from api.db.base import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    title = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)

    event_type = Column(String, nullable=False)
    status = Column(String, default="draft")  # draft | published | archived

    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    start_time = Column(Time)
    end_time = Column(Time)
    timezone = Column(String, default="America/New_York")

    venue = Column(String)
    city = Column(String)
    state = Column(String)

    latitude = Column(Float)
    longitude = Column(Float)
    beach_accessibility = Column(Boolean, default=True)

    participant_capacity = Column(Integer)
    volunteer_capacity = Column(Integer)

    participant_open = Column(Boolean, default=False)
    volunteer_open = Column(Boolean, default=False)
    vendor_open = Column(Boolean, default=False)

    volunteer_count = Column(Integer, default=0)

    featured_image = Column(String)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)