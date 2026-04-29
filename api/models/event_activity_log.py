import uuid

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from .db.base import Base


class EventActivityLog(Base):
    __tablename__ = "event_activity_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(String, nullable=False, index=True)
    event_title = Column(String, nullable=False)
    event_type = Column(String, nullable=True, index=True)

    action_type = Column(String, nullable=False, index=True)
    previous_status = Column(String, nullable=True)
    new_status = Column(String, nullable=True, index=True)

    reason_code = Column(String, nullable=True, index=True)
    reason_note = Column(String, nullable=True)

    actor_user_id = Column(String, nullable=True)
    actor_user_email = Column(String, nullable=True, index=True)

    participant_count = Column(Integer, nullable=True)
    waitlist_count = Column(Integer, nullable=True)
    checked_in_count = Column(Integer, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
