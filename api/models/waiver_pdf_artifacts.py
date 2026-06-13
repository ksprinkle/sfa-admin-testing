import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from api.db.base import Base


class WaiverPdfArtifact(Base):
    __tablename__ = "waiver_pdf_artifacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    waiver_id = Column(
        UUID(as_uuid=True),
        ForeignKey("participant_waivers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    waiver_version = Column(String, nullable=True)
    waiver_revision = Column(Integer, nullable=False, default=1)

    storage_path = Column(String, nullable=False, unique=True)
    mime_type = Column(String, nullable=False, default="application/pdf")
    sha256_hash = Column(String, nullable=False)
    byte_size = Column(Integer, nullable=False)
    is_immutable = Column(Boolean, nullable=False, default=True)

    generated_at = Column(DateTime, server_default=func.now(), nullable=False)
    generated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    waiver = relationship("ParticipantWaiver", back_populates="pdf_artifacts")
    participant = relationship("Participant")
    generated_by_user = relationship("User")

    __table_args__ = (
        UniqueConstraint("waiver_id", "waiver_revision", name="uq_waiver_pdf_artifacts_waiver_revision"),
    )
