import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class NotificationDeliveryEvent(Base):
    __tablename__ = "notification_delivery_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_attempt_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notification_delivery_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type = Column(String, nullable=False, index=True)
    source = Column(String, nullable=True, default="notification_pipeline")
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    delivery_attempt = relationship("NotificationDeliveryAttempt")
