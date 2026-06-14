import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from api.db.base import Base


class CommunicationMessage(Base):
    __tablename__ = "communication_messages"

    STATUS_DRAFT = "draft"
    STATUS_READY = "ready"
    STATUS_DISPATCHED = "dispatched"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("communication_templates.id"), nullable=True, index=True)
    channel = Column(String, nullable=False, index=True)
    audience_type = Column(String, nullable=False, default="manual", index=True)
    audience_filter = Column(JSON, nullable=True)
    subject = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    status = Column(String, nullable=False, default=STATUS_DRAFT, index=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)
