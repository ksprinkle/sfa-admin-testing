import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class NotificationDeliveryAttempt(Base):
    __tablename__ = "notification_delivery_attempts"

    STATUS_PENDING = "pending"
    STATUS_SCHEDULED = "scheduled"
    STATUS_PROCESSING = "processing"
    STATUS_DELIVERED = "delivered"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"
    STATUS_RETRY_PENDING = "retry_pending"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Idempotency key — uniquely identifies one logical delivery attempt so the
    # pipeline cannot enqueue duplicates for the same notification.
    delivery_key = Column(String, nullable=False, unique=True, index=True)

    # Domain that originated the notification (reminder, volunteer, event, admin).
    source_domain = Column(String, nullable=False, index=True)

    # Opaque string reference to the originating entity within source_domain.
    source_id = Column(String, nullable=True, index=True)

    # Optional FK to the reminder execution queue item that triggered this delivery.
    execution_queue_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reminder_execution_queue_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Delivery channel: email, sms, push, or future channels.
    channel = Column(String, nullable=False, index=True)

    # Channel-specific recipient address (email address, phone number, device token, etc.).
    recipient = Column(String, nullable=False)

    # Provider registry key used to resolve the concrete NotificationProvider.
    provider_key = Column(String, nullable=False, default="noop", index=True)

    status = Column(String, nullable=False, default=STATUS_PENDING, index=True)

    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)

    # Scheduled execution time; null means execute as soon as possible.
    scheduled_for = Column(DateTime, nullable=True, index=True)

    # Retry timing and failure state.
    next_retry_at = Column(DateTime, nullable=True, index=True)
    failure_reason = Column(String, nullable=True)

    # Returned by the provider on success.
    provider_message_id = Column(String, nullable=True)

    # Rendered notification content (subject, body, context).
    delivery_payload = Column(JSON, nullable=True)

    # Provider-specific response metadata.
    delivery_metadata = Column(JSON, nullable=True)

    delivered_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    execution_queue_item = relationship("ReminderExecutionQueueItem")
    creator = relationship("User")
