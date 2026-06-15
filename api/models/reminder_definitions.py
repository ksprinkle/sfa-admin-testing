import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from api.db.base import Base


class ReminderDefinition(Base):
    __tablename__ = "reminder_definitions"

    TRIGGER_MANUAL = "manual"
    TRIGGER_EVENT = "event"
    TRIGGER_SCHEDULED = "scheduled"

    CHANNEL_EMAIL = "email"
    CHANNEL_SMS = "sms"
    CHANNEL_PUSH = "push"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reminder_key = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    target_domain = Column(String, nullable=False, index=True)
    trigger_type = Column(String, nullable=False, default=TRIGGER_MANUAL, index=True)
    trigger_config = Column(JSON, nullable=True)
    schedule_config = Column(JSON, nullable=True)
    notification_channels = Column(JSON, nullable=False, default=lambda: ["email"])
    notification_template_key = Column(String, nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)