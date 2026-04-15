from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from uuid import uuid4

from db.base import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False)

    name = Column(String, nullable=False)  # "Session 1", "Session 2"
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)

    capacity = Column(Integer, default=15)

    event = relationship("Event", back_populates="sessions")