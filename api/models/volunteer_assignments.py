import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class VolunteerAssignment(Base):
    __tablename__ = "volunteer_assignments"

    STATUS_ASSIGNED = "assigned"
    STATUS_CONFIRMED = "confirmed"
    STATUS_CANCELLED = "cancelled"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    volunteer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("volunteer_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=True, index=True)
    assignment_role = Column(String, nullable=False)
    status = Column(String, nullable=False, default=STATUS_ASSIGNED, index=True)
    notes = Column(String, nullable=True)
    assigned_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)

    volunteer = relationship("VolunteerProfile", back_populates="assignments")
