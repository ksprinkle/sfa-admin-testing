import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from api.db.base import Base


class CommunicationDelivery(Base):
    __tablename__ = "communication_deliveries"

    STATUS_QUEUED = "queued"
    STATUS_ACCEPTED = "accepted"
    STATUS_FAILED = "failed"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(
        UUID(as_uuid=True),
        ForeignKey("communication_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel = Column(String, nullable=False, index=True)
    recipient = Column(String, nullable=False)
    provider_key = Column(String, nullable=False, default="noop")
    provider_message_id = Column(String, nullable=True)
    status = Column(String, nullable=False, default=STATUS_QUEUED, index=True)
    error_message = Column(String, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    completed_at = Column(DateTime, nullable=True)
