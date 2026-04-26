import uuid
from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID

from api.db.base import Base


class ParticipantRemovalLog(Base):
    __tablename__ = "participant_removal_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_id = Column(String, nullable=False, index=True)
    event_id = Column(String, nullable=False, index=True)

    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)

    was_waitlisted = Column(String, nullable=False, default="false")
    was_checked_in = Column(String, nullable=False, default="false")
    was_waiver_verified = Column(String, nullable=False, default="false")

    removed_reason_code = Column(String, nullable=False)
    removed_reason_note = Column(String, nullable=True)
    removed_stage = Column(String, nullable=False)

    removed_by_user_id = Column(String, nullable=True)
    removed_by_user_email = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
