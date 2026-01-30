import uuid
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from api.db.base import Base


class Participant(Base):
    __tablename__ = "participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    role = Column(String, nullable=False)

    is_minor = Column(Boolean, default=False)

    event = relationship("Event", backref="participants")

    __table_args__ = (
    UniqueConstraint(
        "event_id",
        "email",
        name="uq_event_participant_email"
    ),
)

from pydantic import BaseModel, EmailStr


class ParticipantCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    is_minor: bool = False


class ParticipantOut(BaseModel):
    id: str
    first_name: str
    last_name: str
    email: EmailStr
