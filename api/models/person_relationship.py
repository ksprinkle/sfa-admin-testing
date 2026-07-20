import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class PersonRelationship(Base):
    """Person-to-person relationship with independent capability flags
    (Phase 3B, Slice B4).

    `relationship_type` is descriptive metadata only (a label such as
    "parent", "legal_guardian", "caregiver", "emergency_contact" - an
    open value, not a fixed enum). The capability flags are the actual
    authority and are set independently at row-creation time; nothing
    ever re-derives them from `relationship_type` at read time, so two
    rows with the same type can carry different capabilities (see
    PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_ARCHITECTURE_REVIEW.md §3.1).

    Deliberately inert in this slice: no capability is evaluated, no
    relationship is inferred from existing data, and nothing reads or
    writes this table yet - see PHASE3B_IDENTITY_FOUNDATION_
    IMPLEMENTATION_ROADMAP.md.
    """

    __tablename__ = "person_relationships"

    STATUS_ACTIVE = "active"
    STATUS_REVOKED = "revoked"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    subject_person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False, index=True)
    related_person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False, index=True)
    relationship_type = Column(String, nullable=False)

    can_register_for = Column(Boolean, nullable=False, default=False)
    can_view_documents = Column(Boolean, nullable=False, default=False)
    can_manage_documents = Column(Boolean, nullable=False, default=False)
    can_receive_communications = Column(Boolean, nullable=False, default=False)
    is_emergency_contact_only = Column(Boolean, nullable=False, default=False)

    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id"), nullable=True, index=True)
    status = Column(String, nullable=False, default=STATUS_ACTIVE)

    verified_at = Column(DateTime, nullable=True)
    verified_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    subject_person = relationship("Person", foreign_keys=[subject_person_id])
    related_person = relationship("Person", foreign_keys=[related_person_id])
    household = relationship("Household")
    verified_by_user = relationship("User")
