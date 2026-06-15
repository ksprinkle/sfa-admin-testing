import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class ReminderExecutionQueueItem(Base):
    __tablename__ = "reminder_execution_queue_items"

    STATUS_QUEUED = "queued"
    STATUS_RUNNING = "running"
    STATUS_RETRY_SCHEDULED = "retry_scheduled"
    STATUS_SUCCEEDED = "succeeded"
    STATUS_FAILED = "failed"
    STATUS_SKIPPED = "skipped"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reminder_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reminder_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    execution_key = Column(String, nullable=False, unique=True, index=True)
    trigger_source = Column(String, nullable=False, default="reminder_execution_engine", index=True)
    status = Column(String, nullable=False, default=STATUS_QUEUED, index=True)
    eligibility_reason = Column(String, nullable=True)
    scheduled_for = Column(DateTime, nullable=True, index=True)
    evaluated_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    queued_at = Column(DateTime, nullable=True, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    next_retry_at = Column(DateTime, nullable=True, index=True)
    last_error = Column(String, nullable=True)
    execution_payload = Column(JSON, nullable=True)
    queue_metadata = Column(JSON, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    reminder = relationship("ReminderDefinition")
    creator = relationship("User")