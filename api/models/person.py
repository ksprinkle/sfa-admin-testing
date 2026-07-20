import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class Person(Base):
    """Durable identity anchor (Phase 3B, Slice B1).

    Deliberately inert in this slice: no existing table references
    `people` yet, and nothing in the application reads or writes this
    model. `user_id` is a one-time backfill correlation to the `User`
    this row was created from, not yet the authoritative identity link —
    see PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md.
    """

    __tablename__ = "people"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    email = Column(String, nullable=False, index=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User")
