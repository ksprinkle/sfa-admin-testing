import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class MessageTemplate(Base):
    """Canonical channel-neutral message template definition.

    A template owns the identity, purpose, and channel targeting for a
    notification type.  Rendered content lives in MessageTemplateVersion rows
    so the template definition itself is stable across version changes.
    """

    __tablename__ = "message_templates"

    STATUS_DRAFT = "draft"
    STATUS_ACTIVE = "active"
    STATUS_RETIRED = "retired"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Human-readable machine key used to look up a template by name.
    template_key = Column(String, nullable=False, unique=True, index=True)

    name = Column(String, nullable=False)

    # Broad category describing the notification purpose
    # (e.g. "event_reminder", "waiver_request", "volunteer_confirmation").
    category = Column(String, nullable=False, index=True)

    # Comma-separated or JSON list of supported channels this template targets.
    # Stored as JSON so future channel additions need no schema change.
    supported_channels = Column(JSON, nullable=False, default=lambda: ["email"])

    status = Column(String, nullable=False, default=STATUS_DRAFT, index=True)

    # Optional FK to the currently active version for fast resolution.
    active_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("message_template_versions.id", use_alter=True, name="fk_message_templates_active_version"),
        nullable=True,
    )

    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime, server_default=func.now(), nullable=False)

    versions = relationship(
        "MessageTemplateVersion",
        back_populates="template",
        foreign_keys="MessageTemplateVersion.template_id",
        cascade="all, delete-orphan",
        order_by="MessageTemplateVersion.version_number.desc()",
    )
    active_version = relationship(
        "MessageTemplateVersion",
        foreign_keys=[active_version_id],
        post_update=True,
    )
    creator = relationship("User", foreign_keys=[created_by_user_id])
    updater = relationship("User", foreign_keys=[updated_by_user_id])
