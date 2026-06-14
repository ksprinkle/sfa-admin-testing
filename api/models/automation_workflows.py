import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class AutomationWorkflow(Base):
    __tablename__ = "automation_workflows"

    TRIGGER_MANUAL = "manual"
    TRIGGER_EVENT = "event"
    TRIGGER_SCHEDULED = "scheduled"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_key = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    trigger_type = Column(String, nullable=False, default=TRIGGER_MANUAL, index=True)
    target_domain = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    is_enabled = Column(Boolean, nullable=False, default=True)
    config = Column(JSON, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)

    runs = relationship(
        "AutomationRun",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="AutomationRun.created_at.desc()",
    )
