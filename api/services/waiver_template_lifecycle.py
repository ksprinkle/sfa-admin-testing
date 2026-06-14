from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.models.waiver_templates import WaiverTemplate


def normalize_title(value: str) -> str:
    return (value or "").strip()


def normalize_content(value: str) -> str:
    return (value or "").strip()


def get_template_or_404(db: Session, template_id: UUID) -> WaiverTemplate:
    template = db.query(WaiverTemplate).filter(WaiverTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Waiver template not found")
    return template


def get_active_template(db: Session) -> WaiverTemplate | None:
    return (
        db.query(WaiverTemplate)
        .filter(WaiverTemplate.status == WaiverTemplate.STATUS_ACTIVE)
        .order_by(WaiverTemplate.activated_at.desc(), WaiverTemplate.created_at.desc())
        .first()
    )


def ensure_editable(template: WaiverTemplate) -> None:
    if template.status != WaiverTemplate.STATUS_DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Only draft waiver templates are editable. Create a new version to modify active or archived templates.",
        )


def resolve_supersedes_template(
    db: Session,
    *,
    supersedes_template_id: UUID | None,
    exclude_template_id: UUID | None = None,
) -> WaiverTemplate | None:
    if not supersedes_template_id:
        return None

    superseded = get_template_or_404(db, supersedes_template_id)
    if exclude_template_id and superseded.id == exclude_template_id:
        raise HTTPException(status_code=400, detail="Template cannot supersede itself")
    return superseded


def next_version_number(db: Session) -> int:
    current_max = db.query(func.max(WaiverTemplate.version)).scalar()
    return int(current_max or 0) + 1


def create_template(
    db: Session,
    *,
    title: str,
    content: str,
    actor_user_id: str | None,
    supersedes_template_id: UUID | None,
) -> WaiverTemplate:
    normalized_title = normalize_title(title)
    normalized_content = normalize_content(content)

    if not normalized_title:
        raise HTTPException(status_code=400, detail="title is required")
    if not normalized_content:
        raise HTTPException(status_code=400, detail="content is required")

    superseded = resolve_supersedes_template(
        db,
        supersedes_template_id=supersedes_template_id,
    )

    template = WaiverTemplate(
        title=normalized_title,
        content=normalized_content,
        version=next_version_number(db),
        status=WaiverTemplate.STATUS_DRAFT,
        created_by_user_id=actor_user_id,
        supersedes_template_id=superseded.id if superseded else None,
    )
    db.add(template)
    return template


def update_template(
    db: Session,
    *,
    template: WaiverTemplate,
    title: str | None,
    content: str | None,
) -> WaiverTemplate:
    ensure_editable(template)

    if title is not None:
        normalized_title = normalize_title(title)
        if not normalized_title:
            raise HTTPException(status_code=400, detail="title is required")
        template.title = normalized_title

    if content is not None:
        normalized_content = normalize_content(content)
        if not normalized_content:
            raise HTTPException(status_code=400, detail="content is required")
        template.content = normalized_content

    return template


def archive_template(
    db: Session,
    *,
    template: WaiverTemplate,
    actor_user_id: str | None,
) -> WaiverTemplate:
    if template.status == WaiverTemplate.STATUS_ACTIVE:
        raise HTTPException(
            status_code=400,
            detail="Active template cannot be archived directly. Activate a different draft version instead.",
        )
    if template.status == WaiverTemplate.STATUS_ARCHIVED:
        return template

    template.status = WaiverTemplate.STATUS_ARCHIVED
    template.archived_at = datetime.utcnow()
    template.archived_by_user_id = actor_user_id
    return template


def activate_template(
    db: Session,
    *,
    template: WaiverTemplate,
    actor_user_id: str | None,
    supersedes_template_id: UUID | None,
) -> WaiverTemplate:
    if template.status != WaiverTemplate.STATUS_DRAFT:
        raise HTTPException(status_code=400, detail="Only draft templates can be activated")

    previous_active = get_active_template(db)

    if supersedes_template_id:
        superseded = resolve_supersedes_template(
            db,
            supersedes_template_id=supersedes_template_id,
            exclude_template_id=template.id,
        )
        template.supersedes_template_id = superseded.id
    elif previous_active and previous_active.id != template.id:
        template.supersedes_template_id = previous_active.id

    now = datetime.utcnow()

    if previous_active and previous_active.id != template.id:
        previous_active.status = WaiverTemplate.STATUS_ARCHIVED
        previous_active.archived_at = now
        previous_active.archived_by_user_id = actor_user_id

    template.status = WaiverTemplate.STATUS_ACTIVE
    template.activated_at = now
    template.activated_by_user_id = actor_user_id
    template.archived_at = None
    template.archived_by_user_id = None
    return template
