import uuid
from sqlalchemy import Column, String, Date, Time, Boolean, Integer, Float, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from api.db.base import Base
from sqlalchemy.orm import relationship
from sqlalchemy import select, func
from sqlalchemy.orm import column_property
from api.models.participants import Participant

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

    participant_capacity = Column(Integer, nullable=True)
    volunteer_capacity = Column(Integer, nullable=True)

    participant_open = Column(Boolean, default=False)
    volunteer_open = Column(Boolean, default=False)
    vendor_open = Column(Boolean, default=False)

    featured_image = Column(String)
    participants = relationship("Participant", back_populates="event")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    surfer_count = column_property(
    select(func.count(Participant.id))
    .where(
        Participant.event_id == id,
        Participant.role == "surfer",
        Participant.is_waitlisted == False
    )
    .correlate_except(Participant)
    .scalar_subquery()
)
    waitlist_count = column_property(
    select(func.count(Participant.id))
    .where(
        Participant.event_id == id,
        Participant.role == "surfer",
        Participant.is_waitlisted == True
    )
    .correlate_except(Participant)
    .scalar_subquery()
)
    checked_in_count = column_property(
    select(func.count(Participant.id))
    .where(
        Participant.event_id == id,
        Participant.checked_in == True
    )
    .correlate_except(Participant)
    .scalar_subquery()
)
    volunteer_count = column_property(
    select(func.count(Participant.id))
    .where(
        Participant.event_id == id,
        Participant.role == "volunteer"
    )
    .correlate_except(Participant)
    .scalar_subquery()
)


