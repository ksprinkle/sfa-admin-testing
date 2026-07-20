import uuid

from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from api.db.base import Base


class Role(Base):
    """Role lookup table (Phase 3B, Slice B1).

    Deliberately inert in this slice: nothing references `roles` yet —
    authorization still reads `User.role` exactly as before. Seeded with
    the two roles already defined in api/services/authorization.py
    (ROLE_PARTICIPANT, ROLE_ADMIN) so a later slice's PersonRole table
    has a stable set of rows to reference.
    """

    __tablename__ = "roles"

    CODE_PARTICIPANT = "participant"
    CODE_ADMIN = "admin"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, nullable=False, unique=True, index=True)
    display_name = Column(String, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
