import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class AdminAuditEvent(Base):
    __tablename__ = "admin_audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    actor_user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    target_type = Column(String, nullable=True, index=True)
    target_id = Column(String, nullable=True, index=True)
    target_display = Column(String, nullable=True)
    source = Column(String, nullable=True, default="admin_api")
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    actor = relationship("User")