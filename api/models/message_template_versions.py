import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class MessageTemplateVersion(Base):
    """Immutable published version of a message template.

    Each version captures the subject pattern, body pattern, variable
    declarations, and rendering metadata at a point in time.  Published
    versions are never mutated; new versions are created instead.
    Only one version per template may be active at a time.
    """

    __tablename__ = "message_template_versions"

    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"
    STATUS_RETIRED = "retired"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(
        UUID(as_uuid=True),
        ForeignKey("message_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Monotonically increasing within a template; set by the service layer.
    version_number = Column(Integer, nullable=False, index=True)

    status = Column(String, nullable=False, default=STATUS_DRAFT, index=True)

    # Subject line pattern; may contain {{variable}} placeholders.
    # Nullable because some channels (SMS, push) have no subject concept.
    subject_pattern = Column(String, nullable=True)

    # Body pattern; may contain {{variable}} placeholders.
    body_pattern = Column(Text, nullable=False)

    # Declared variable schema:
    # [{"name": "first_name", "required": true, "description": "..."},  ...]
    variable_definitions = Column(JSON, nullable=False, default=list)

    # Arbitrary rendering hints consumed by the renderer but ignored by the
    # pipeline (e.g. {"html_body": "...", "plain_text_body": "..."}).
    rendering_hints = Column(JSON, nullable=True)

    # True once this version has been published; published versions are
    # immutable — no further edits are permitted.
    is_published = Column(Boolean, nullable=False, default=False)

    published_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    template = relationship(
        "MessageTemplate",
        back_populates="versions",
        foreign_keys=[template_id],
    )
    creator = relationship("User", foreign_keys=[created_by_user_id])
