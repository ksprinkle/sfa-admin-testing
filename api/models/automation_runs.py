import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class AutomationRun(Base):
    __tablename__ = "automation_runs"

    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_SUCCEEDED = "succeeded"
    STATUS_FAILED = "failed"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(
        UUID(as_uuid=True),
        ForeignKey("automation_workflows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trigger_source = Column(String, nullable=False, default="manual_api")
    status = Column(String, nullable=False, default=STATUS_PENDING, index=True)
    trigger_payload = Column(JSON, nullable=True)
    result_payload = Column(JSON, nullable=True)
    error_message = Column(String, nullable=True)
    initiated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    workflow = relationship("AutomationWorkflow", back_populates="runs")
    initiator = relationship("User")
