import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class ParticipantWaiver(Base):
    __tablename__ = "participant_waivers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    status = Column(String, nullable=False, default="pending")
    source = Column(String, nullable=False, default="staff_override")
    waiver_version = Column(String, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    verified_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    notes = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    participant = relationship("Participant", back_populates="waiver")
    verifier = relationship("User")
