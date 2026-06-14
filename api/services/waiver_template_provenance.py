from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
from uuid import UUID

from sqlalchemy.orm import Session

from api.models.participant_waivers import ParticipantWaiver
from api.models.waiver_templates import WaiverTemplate


@dataclass
class TemplateSnapshot:
    template_id: UUID
    template_version: int
    template_content_sha256: str


def hash_template_content(content: str) -> str:
    normalized_content = (content or "").encode("utf-8")
    return hashlib.sha256(normalized_content).hexdigest()


def _parse_uuid(value: object) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (ValueError, TypeError):
        return None


def _parse_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def get_active_template_snapshot(db: Session) -> TemplateSnapshot | None:
    template = (
        db.query(WaiverTemplate)
        .filter(WaiverTemplate.status == WaiverTemplate.STATUS_ACTIVE)
        .order_by(WaiverTemplate.activated_at.desc(), WaiverTemplate.created_at.desc())
        .first()
    )
    if template is None:
        return None

    return TemplateSnapshot(
        template_id=template.id,
        template_version=int(template.version),
        template_content_sha256=hash_template_content(template.content),
    )


def resolve_template_snapshot_for_waiver(db: Session, waiver: ParticipantWaiver) -> TemplateSnapshot | None:
    metadata = waiver.version_metadata if isinstance(waiver.version_metadata, dict) else {}

    metadata_template_id = _parse_uuid(metadata.get("waiver_template_id"))
    metadata_template_version = _parse_int(metadata.get("template_version"))
    metadata_content_hash = str(metadata.get("template_content_sha256") or "").strip() or None

    if metadata_template_id:
        template = db.query(WaiverTemplate).filter(WaiverTemplate.id == metadata_template_id).first()
        if template:
            return TemplateSnapshot(
                template_id=template.id,
                template_version=int(template.version),
                template_content_sha256=metadata_content_hash or hash_template_content(template.content),
            )

    if metadata_template_version is not None:
        template = db.query(WaiverTemplate).filter(WaiverTemplate.version == metadata_template_version).first()
        if template:
            return TemplateSnapshot(
                template_id=template.id,
                template_version=int(template.version),
                template_content_sha256=metadata_content_hash or hash_template_content(template.content),
            )

    signed_at = waiver.signed_at or datetime.utcnow()
    historical_template = (
        db.query(WaiverTemplate)
        .filter(
            WaiverTemplate.activated_at.isnot(None),
            WaiverTemplate.activated_at <= signed_at,
            (WaiverTemplate.archived_at.is_(None) | (WaiverTemplate.archived_at > signed_at)),
        )
        .order_by(WaiverTemplate.activated_at.desc(), WaiverTemplate.created_at.desc())
        .first()
    )
    if historical_template:
        return TemplateSnapshot(
            template_id=historical_template.id,
            template_version=int(historical_template.version),
            template_content_sha256=hash_template_content(historical_template.content),
        )

    return get_active_template_snapshot(db)
