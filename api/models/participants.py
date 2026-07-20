import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, UniqueConstraint, DateTime, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from api.db.base import Base


class Participant(Base):
    __tablename__ = "participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=True)

    # Links this per-event roster row to the authenticated participant-role
    # account that self-registered it, if any (admin-created rows and
    # anonymous public registrations leave this null). User.id is String
    # (see api/models/users.py), matching the FK type used elsewhere for
    # user references, e.g. ParticipantWaiver.verified_by_user_id.
    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)

    # Phase 3B Slice B2: backfill-only correlation to the Person this
    # registration belongs to, via people.user_id (see PHASE3B_IDENTITY_
    # FOUNDATION_IMPLEMENTATION_ROADMAP.md). Not yet read by any ownership
    # check or authorization decision - user_id remains authoritative
    # until a later, behavior-changing slice.
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=True, index=True)

    session = relationship("Session")
    user = relationship("User")
    person = relationship("Person")

    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, nullable=False)

    role = Column(String, nullable=False, default="participant")
    is_minor = Column(Boolean, default=False)
    requires_assistance = Column(Boolean, nullable=False, default=False)

    is_waitlisted = Column(Boolean, default=False)

    priority = Column(Integer, default=0, nullable=False)  # Lower number = higher priority

    waiver_signed = Column(Boolean, default=False)
    waiver_verified = Column(Boolean, default=False)
    waiver_signed_at = Column(DateTime, nullable=True)
    
    volunteer_type = Column(String, nullable=True)  # primary: food | raffle | beach | instructor | buddy
    volunteer_additional_types = Column(JSON, nullable=False, default=list)
    volunteer_is_versatile = Column(Boolean, nullable=False, default=False)

    checked_in = Column(Boolean, default=False)
    checked_in_at = Column(DateTime, nullable=True)

    removed_at = Column(DateTime, nullable=True)
    removed_reason_code = Column(String, nullable=True)
    removed_reason_note = Column(String, nullable=True)
    removed_by_user_id = Column(String, nullable=True)
    removed_stage = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    event = relationship("Event", back_populates="participants")
    waiver = relationship(
        "ParticipantWaiver",
        back_populates="participant",
        uselist=False,
        cascade="all, delete-orphan",
    )
    notes = Column(String, nullable=True)
    
    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "email",
            name="uq_event_participant_email"
        ),
    )
   