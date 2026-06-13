import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class ParticipantWaiver(Base):
    __tablename__ = "participant_waivers"

    STATUS_DRAFT = "draft"
    STATUS_SENT = "sent"
    STATUS_VIEWED = "viewed"
    STATUS_SIGNED = "signed"
    STATUS_ARCHIVED = "archived"
    STATUS_SUPERSEDED = "superseded"

    # Legacy aliases retained for backward compatibility with pre-Phase-2 rows.
    LEGACY_STATUS_PENDING = "pending"
    LEGACY_STATUS_VERIFIED = "verified"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    status = Column(String, nullable=False, default=STATUS_DRAFT)
    source = Column(String, nullable=False, default="staff_override")
    waiver_version = Column(String, nullable=True)
    current_revision = Column(Integer, nullable=False, default=1)
    version_metadata = Column(JSON, nullable=True)

    sent_at = Column(DateTime, nullable=True)
    viewed_at = Column(DateTime, nullable=True)
    signed_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True)
    superseded_at = Column(DateTime, nullable=True)

    verified_at = Column(DateTime, nullable=True)
    verified_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    notes = Column(String, nullable=True)

    lifecycle_updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    participant = relationship("Participant", back_populates="waiver")
    verifier = relationship("User")
    audit_events = relationship(
        "WaiverAuditEvent",
        back_populates="waiver",
        cascade="all, delete-orphan",
        order_by="WaiverAuditEvent.created_at.asc()",
    )
    signing_tokens = relationship(
        "WaiverSigningToken",
        back_populates="waiver",
        cascade="all, delete-orphan",
        order_by="WaiverSigningToken.created_at.asc()",
    )


# Domain-forward alias used in Phase 2 documentation and service APIs.
Waiver = ParticipantWaiver
