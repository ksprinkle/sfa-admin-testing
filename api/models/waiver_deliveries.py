import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class WaiverDelivery(Base):
    __tablename__ = "waiver_deliveries"

    METHOD_EMAIL = "email"
    METHOD_SMS = "sms"

    STATUS_CREATED = "created"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_COMPLETED = "completed"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    waiver_id = Column(
        UUID(as_uuid=True),
        ForeignKey("participant_waivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resend_of_delivery_id = Column(
        UUID(as_uuid=True),
        ForeignKey("waiver_deliveries.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    method = Column(String, nullable=False)
    recipient = Column(String, nullable=False)
    status = Column(String, nullable=False, default=STATUS_CREATED)
    attempt_number = Column(Integer, nullable=False, default=1)

    template_key = Column(String, nullable=False, default="default")
    rendered_subject = Column(String, nullable=True)
    rendered_body = Column(String, nullable=False)

    signing_path = Column(String, nullable=False)
    token_expires_at = Column(DateTime, nullable=False)

    provider_message_id = Column(String, nullable=True)
    error_message = Column(String, nullable=True)

    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    completed_at = Column(DateTime, nullable=True)
    delivery_metadata = Column(JSON, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    waiver = relationship("ParticipantWaiver", back_populates="deliveries")
    participant = relationship("Participant")
    created_by_user = relationship("User")
    resend_of_delivery = relationship("WaiverDelivery", remote_side=[id])
