import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from api.db.base import Base


class EventOperation(Base):
    __tablename__ = "event_operations"

    OPERATIONAL_STATUS_DRAFT = "draft"
    OPERATIONAL_STATUS_READY = "ready"
    OPERATIONAL_STATUS_ACTIVE = "active"
    OPERATIONAL_STATUS_AT_RISK = "at_risk"
    OPERATIONAL_STATUS_COMPLETED = "completed"

    READINESS_STATUS_NOT_READY = "not_ready"
    READINESS_STATUS_PARTIAL = "partial"
    READINESS_STATUS_READY = "ready"

    CAPACITY_STATUS_UNKNOWN = "unknown"
    CAPACITY_STATUS_AVAILABLE = "available"
    CAPACITY_STATUS_NEAR_CAPACITY = "near_capacity"
    CAPACITY_STATUS_AT_CAPACITY = "at_capacity"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    operational_status = Column(String, nullable=False, default=OPERATIONAL_STATUS_DRAFT, index=True)
    readiness_status = Column(String, nullable=False, default=READINESS_STATUS_NOT_READY, index=True)
    capacity_status = Column(String, nullable=False, default=CAPACITY_STATUS_UNKNOWN, index=True)

    participant_capacity = Column(Integer, nullable=True)
    participant_count = Column(Integer, nullable=False, default=0)
    volunteer_capacity = Column(Integer, nullable=True)
    volunteer_assignment_count = Column(Integer, nullable=False, default=0)

    readiness_score = Column(Float, nullable=False, default=0.0)
    blockers = Column(JSON, nullable=False, default=list)
    notes = Column(String, nullable=True)

    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)
