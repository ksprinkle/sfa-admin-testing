import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class WaiverTemplate(Base):
    __tablename__ = "waiver_templates"

    STATUS_DRAFT = "draft"
    STATUS_ACTIVE = "active"
    STATUS_ARCHIVED = "archived"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    version = Column(Integer, nullable=False, unique=True, index=True)
    status = Column(String, nullable=False, default=STATUS_DRAFT, index=True)

    content = Column(Text, nullable=False)

    supersedes_template_id = Column(
        UUID(as_uuid=True),
        ForeignKey("waiver_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    activated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    archived_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)

    activated_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    supersedes_template = relationship("WaiverTemplate", remote_side=[id], uselist=False)
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    activated_by = relationship("User", foreign_keys=[activated_by_user_id])
    archived_by = relationship("User", foreign_keys=[archived_by_user_id])
