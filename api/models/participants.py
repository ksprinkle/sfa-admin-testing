import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from api.db.base import Base


class Participant(Base):
    __tablename__ = "participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=True)

    session = relationship("Session")
    
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, nullable=False)

    role = Column(String, nullable=False, default="participant")
    is_minor = Column(Boolean, default=False)

    is_waitlisted = Column(Boolean, default=False)

    waiver_signed = Column(Boolean, default=False)
    waiver_verified = Column(Boolean, default=False)
    waiver_signed_at = Column(DateTime, nullable=True)
    
    checked_in = Column(Boolean, default=False)
    checked_in_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    event = relationship("Event", back_populates="participants")
    notes = Column(String, nullable=True)
    
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "email",
            name="uq_event_participant_email"
        ),
    )
   