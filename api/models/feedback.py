import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from api.db.base import Base


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feature = Column(String, nullable=False)
    version = Column(String, nullable=False)
    responses = Column(Text, nullable=False)  # JSON-encoded dict
    summary = Column(Text, nullable=True)     # JSON-encoded computed summary
    time_to_complete = Column(Integer, nullable=True)  # seconds
    submitted_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Populated from the authenticated user at submission time, never from client input.
    # Null for anonymous submissions and for records predating this field.
    submitted_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    submitted_by_name = Column(String, nullable=True)
    submitted_by_email = Column(String, nullable=True)
