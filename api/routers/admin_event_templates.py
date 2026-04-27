from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.crud.events import create_event as crud_create_event
from api.db.session import get_db
from api.dependencies import require_admin
from api.models.event_templates import EventTemplate
from api.schemas.event_templates import (
    CreateEventFromTemplateIn,
    EventTemplateCreate,
    EventTemplateOut,
    EventTemplateUpdate,
)
from api.schemas.events import AdminEventListOut, EventCreate
from api.utils.event_builder import build_admin_event


router = APIRouter(
    prefix="/admin/event-templates",
    tags=["Admin Event Templates"],
)


@router.post("", response_model=EventTemplateOut, status_code=status.HTTP_201_CREATED)
def create_event_template(
    template_in: EventTemplateCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    template = EventTemplate(**template_in.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("", response_model=list[EventTemplateOut])
def list_event_templates(
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    return (
        db.query(EventTemplate)
        .order_by(EventTemplate.name.asc(), EventTemplate.created_at.desc())
        .all()
    )


@router.get("/{template_id}", response_model=EventTemplateOut)
def get_event_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    template = db.query(EventTemplate).filter(EventTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Event template not found")
    return template


@router.put("/{template_id}", response_model=EventTemplateOut)
def update_event_template(
    template_id: UUID,
    template_in: EventTemplateUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    template = db.query(EventTemplate).filter(EventTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Event template not found")

    for field, value in template_in.model_dump(exclude_unset=True).items():
        setattr(template, field, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}")
def delete_event_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    template = db.query(EventTemplate).filter(EventTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Event template not found")

    db.delete(template)
    db.commit()
    return {"message": "Event template deleted"}


@router.post("/{template_id}/create-event", response_model=AdminEventListOut, status_code=status.HTTP_201_CREATED)
def create_event_from_template(
    template_id: UUID,
    payload: CreateEventFromTemplateIn,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    template = db.query(EventTemplate).filter(EventTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Event template not found")

    event_in = EventCreate(
        title=template.name,
        event_type=template.event_type,
        start_date=payload.date,
        start_time=template.default_start_time,
        end_time=template.default_end_time,
        venue=template.location,
        participant_capacity=template.capacity,
        status="draft",
    )

    event = crud_create_event(db, event_in)
    event.status = "draft"
    db.commit()
    db.refresh(event)
    return build_admin_event(event)