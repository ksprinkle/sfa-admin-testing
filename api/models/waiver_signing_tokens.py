import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class WaiverSigningToken(Base):
    __tablename__ = "waiver_signing_tokens"

    STATUS_ACTIVE = "active"
    STATUS_COMPLETED = "completed"
    STATUS_EXPIRED = "expired"
    STATUS_INVALIDATED = "invalidated"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    waiver_id = Column(
        UUID(as_uuid=True),
        ForeignKey("participant_waivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String, nullable=False, unique=True, index=True)
    status = Column(String, nullable=False, default=STATUS_ACTIVE)

    issued_at = Column(DateTime, server_default=func.now(), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    first_viewed_at = Column(DateTime, nullable=True)
    last_validated_at = Column(DateTime, nullable=True)
    used_at = Column(DateTime, nullable=True)
    signed_at = Column(DateTime, nullable=True)
    invalidated_at = Column(DateTime, nullable=True)

    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    token_metadata = Column(JSON, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    waiver = relationship("ParticipantWaiver", back_populates="signing_tokens")
    created_by_user = relationship("User")
