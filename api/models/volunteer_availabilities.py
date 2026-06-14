import uuid

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class VolunteerAvailability(Base):
    __tablename__ = "volunteer_availabilities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    volunteer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("volunteer_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    weekday = Column(Integer, nullable=True)
    availability_date = Column(Date, nullable=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    availability_status = Column(String, nullable=False, default="available")
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    volunteer = relationship("VolunteerProfile", back_populates="availabilities")
