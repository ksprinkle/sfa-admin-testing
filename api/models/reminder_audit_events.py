import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class ReminderAuditEvent(Base):
    __tablename__ = "reminder_audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reminder_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reminder_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type = Column(String, nullable=False, index=True)
    actor_user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    source = Column(String, nullable=True, default="reminder_api")
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    reminder = relationship("ReminderDefinition")
    actor = relationship("User")