import uuid

from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from api.db.base import Base


class Household(Base):
    """Lightweight, optional named grouping (Phase 3B, Slice B4).

    Never an owner of records - a household never registers, signs, or
    volunteers; a Person does. This table only exists to let
    PersonRelationship rows optionally cluster under a shared label (a
    family, a group home, a sponsor organization). Deliberately inert in
    this slice: nothing reads or writes it yet - see
    PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md.
    """

    __tablename__ = "households"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
