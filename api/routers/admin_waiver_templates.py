from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_admin
from api.models.waiver_templates import WaiverTemplate
from api.schemas.waiver_templates import (
    WaiverTemplateActivateIn,
    WaiverTemplateCreate,
    WaiverTemplateOut,
    WaiverTemplatePreviewOut,
    WaiverTemplateUpdate,
)
from api.services.waiver_template_lifecycle import (
    activate_template,
    archive_template,
    create_template,
    get_active_template,
    get_template_or_404,
    update_template,
)


router = APIRouter(
    prefix="/admin/waiver-templates",
    tags=["Admin Waiver Templates"],
)


@router.post("", response_model=WaiverTemplateOut, status_code=status.HTTP_201_CREATED)
def create_waiver_template(
    payload: WaiverTemplateCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    template = create_template(
        db,
        title=payload.title,
        content=payload.content,
        actor_user_id=str(getattr(current_user, "id", "") or "") or None,
        supersedes_template_id=payload.supersedes_template_id,
    )
    db.commit()
    db.refresh(template)
    return template


@router.get("", response_model=list[WaiverTemplateOut])
def list_waiver_templates(
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    return (
        db.query(WaiverTemplate)
        .order_by(WaiverTemplate.version.desc())
        .all()
    )


@router.get("/active", response_model=WaiverTemplateOut)
def get_active_waiver_template(
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    template = get_active_template(db)
    if not template:
        raise HTTPException(status_code=404, detail="No active waiver template")
    return template


@router.get("/{template_id}", response_model=WaiverTemplateOut)
def get_waiver_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    return get_template_or_404(db, template_id)


@router.get("/{template_id}/preview", response_model=WaiverTemplatePreviewOut)
def preview_waiver_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    template = get_template_or_404(db, template_id)
    return template


@router.put("/{template_id}", response_model=WaiverTemplateOut)
def update_waiver_template(
    template_id: UUID,
    payload: WaiverTemplateUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    template = get_template_or_404(db, template_id)
    template = update_template(
        db,
        template=template,
        title=payload.title,
        content=payload.content,
    )
    db.commit()
    db.refresh(template)
    return template


@router.post("/{template_id}/activate", response_model=WaiverTemplateOut)
def activate_waiver_template(
    template_id: UUID,
    payload: WaiverTemplateActivateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    template = get_template_or_404(db, template_id)
    template = activate_template(
        db,
        template=template,
        actor_user_id=str(getattr(current_user, "id", "") or "") or None,
        supersedes_template_id=payload.supersedes_template_id,
    )
    db.commit()
    db.refresh(template)
    return template


@router.post("/{template_id}/archive", response_model=WaiverTemplateOut)
def archive_waiver_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    template = get_template_or_404(db, template_id)
    template = archive_template(
        db,
        template=template,
        actor_user_id=str(getattr(current_user, "id", "") or "") or None,
    )
    db.commit()
    db.refresh(template)
    return template
