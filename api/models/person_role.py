import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class PersonRole(Base):
    """Role grant for a Person (Phase 3B, Slice B3).

    Dual-read infrastructure: api/services/authorization.py::has_permission()
    checks for this person's active PersonRole rows first and falls back
    to the legacy User.role only when none exist - see
    PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md. User.role
    remains authoritative wherever no PersonRole rows exist yet, and
    continues to be written exactly as before.
    """

    __tablename__ = "person_roles"

    STATUS_ACTIVE = "active"
    STATUS_REVOKED = "revoked"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False, index=True)
    role_code = Column(String, ForeignKey("roles.code"), nullable=False, index=True)
    status = Column(String, nullable=False, default=STATUS_ACTIVE)

    granted_at = Column(DateTime, server_default=func.now(), nullable=False)
    granted_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    person = relationship("Person")
    granted_by_user = relationship("User")

    __table_args__ = (
        UniqueConstraint("person_id", "role_code", name="uq_person_roles_person_id_role_code"),
    )
