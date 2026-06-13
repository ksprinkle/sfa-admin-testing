import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class WaiverAuditEvent(Base):
    __tablename__ = "waiver_audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    waiver_id = Column(
        UUID(as_uuid=True),
        ForeignKey("participant_waivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type = Column(String, nullable=False, default="status_transition")
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False)
    actor_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    source = Column(String, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    waiver = relationship("ParticipantWaiver", back_populates="audit_events")
    actor = relationship("User")