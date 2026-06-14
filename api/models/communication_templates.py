import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from api.db.base import Base


class CommunicationTemplate(Base):
    __tablename__ = "communication_templates"

    CHANNEL_EMAIL = "email"
    CHANNEL_SMS = "sms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_key = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    channel = Column(String, nullable=False, default=CHANNEL_EMAIL, index=True)
    subject_template = Column(String, nullable=True)
    body_template = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)
