import uuid
from sqlalchemy import Column, String, Date, Time, Boolean, Integer, Float, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from api.db.base import Base
from sqlalchemy.orm import relationship
from sqlalchemy import select, func
from sqlalchemy.orm import column_property

class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    title = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)

    event_type = Column(String, nullable=False)
    status = Column(String, default="draft")  # draft | published | archived
    
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    start_time = Column(Time)
    end_time = Column(Time)
    timezone = Column(String, default="America/New_York")

    sessions = relationship("Session", back_populates="event", cascade="all, delete-orphan")
    participants = relationship("Participant", back_populates="event", cascade="all, delete-orphan")
    
    venue = Column(String)
    city = Column(String)
    state = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    beach_accessibility = Column(Boolean, default=True)
    beach_access_notes = Column(Text)
    directions = Column(Text)
    parking_info = Column(Text)
    lodging_info = Column(Text)
    weather_report_url = Column(String)
    surf_report_url = Column(String)

    participant_capacity = Column(Integer)
    volunteer_capacity = Column(Integer)

    participant_open = Column(Boolean, default=False)
    volunteer_open = Column(Boolean, default=False)
    exhibitor_open = Column("vendor_open", Boolean, default=False)
    website_schedule_published = Column(Boolean, default=False)

    featured_image = Column(String)
    internal_notes = Column(Text)
    no_show_minutes = Column(Integer, default=15)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)


    @property
    def surfer_count(self):
        from api.models.participants import Participant
        from sqlalchemy.orm import object_session
        session = object_session(self)
        if session is None:
            return 0
        return session.query(Participant).filter(
            Participant.event_id == self.id,
            Participant.removed_at.is_(None),
            ((Participant.checked_in == True) |
             ((Participant.role == "surfer") & (Participant.is_waitlisted == False)))
        ).count()

    @property
    def waitlist_count(self):
        from api.models.participants import Participant
        from sqlalchemy.orm import object_session
        session = object_session(self)
        if session is None:
            return 0
        return session.query(Participant).filter(
            Participant.event_id == self.id,
            Participant.removed_at.is_(None),
            Participant.is_waitlisted == True
        ).count()

    @property
    def checked_in_count(self):
        from api.models.participants import Participant
        from sqlalchemy.orm import object_session
        session = object_session(self)
        if session is None:
            return 0
        return session.query(Participant).filter(
            Participant.event_id == self.id,
            Participant.removed_at.is_(None),
            Participant.checked_in == True
        ).count()

    @property
    def volunteer_count(self):
        from api.models.participants import Participant
        from sqlalchemy.orm import object_session
        session = object_session(self)
        if session is None:
            return 0
        return session.query(Participant).filter(
            Participant.event_id == self.id,
            Participant.removed_at.is_(None),
        ).count()

    @property
    def vendor_open(self):
        return self.exhibitor_open

    @vendor_open.setter
    def vendor_open(self, value):
        self.exhibitor_open = value


