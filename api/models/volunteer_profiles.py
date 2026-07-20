import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class VolunteerProfile(Base):
    __tablename__ = "volunteer_profiles"

    STATUS_ACTIVE = "active"
    STATUS_INACTIVE = "inactive"
    STATUS_SUSPENDED = "suspended"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    phone = Column(String, nullable=True)
    lifecycle_status = Column(String, nullable=False, default=STATUS_ACTIVE, index=True)
    skills = Column(JSON, nullable=False, default=list)
    certifications = Column(JSON, nullable=False, default=list)
    notes = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Phase 3B Slice B2: additive identity link, no existing correlation to
    # backfill from - starts null for every row (see PHASE3B_IDENTITY_
    # FOUNDATION_IMPLEMENTATION_ROADMAP.md). Not read anywhere yet.
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=True, index=True)
    person = relationship("Person")

    availabilities = relationship(
        "VolunteerAvailability",
        back_populates="volunteer",
        cascade="all, delete-orphan",
        order_by="VolunteerAvailability.created_at.desc()",
    )
    assignments = relationship(
        "VolunteerAssignment",
        back_populates="volunteer",
        cascade="all, delete-orphan",
        order_by="VolunteerAssignment.created_at.desc()",
    )
