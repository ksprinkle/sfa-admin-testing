from uuid import UUID
from typing import Union

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.crud.events import create_event as crud_create_event
from api.db.session import get_db
from api.dependencies import require_admin
from api.models.events import Event
from api.models.event_templates import EventTemplate
from api.schemas.event_templates import (
    CreateEventFromTemplateIn,
    EventTemplateCreate,
    GenerateAnnualEventsFromTemplateIn,
    GenerateAnnualEventsFromTemplateOut,
    GenerateAnnualPreviewDateOut,
    GenerateAnnualPreviewOut,
    EventTemplateOut,
    EventTemplateUpdate,
)
from api.schemas.events import AdminEventListOut, EventCreate
from api.utils.event_builder import build_admin_event
from api.utils.schedule_rules import generate_dates_from_template


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
    template = _get_template_or_404(db, template_id)
    event = _create_event_from_template_date(db, template, payload.date)
    return build_admin_event(event)


@router.post(
    "/{template_id}/generate-annual",
    response_model=Union[GenerateAnnualEventsFromTemplateOut, GenerateAnnualPreviewOut],
    status_code=status.HTTP_201_CREATED,
)
def generate_annual_events_from_template(
    template_id: UUID,
    payload: GenerateAnnualEventsFromTemplateIn,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    template = _get_template_or_404(db, template_id)

    normalized_event_type = str(template.event_type or "").strip().lower()
    if normalized_event_type == "tour":
        if getattr(template, "schedule_rule_type", None):
            print(f"Warning: Tour template {template.id} has schedule rules but will be ignored")

        template_date = getattr(template, "date", None)

        if payload.preview:
            preview_dates = []
            if template_date:
                preview_dates = [
                    GenerateAnnualPreviewDateOut(
                        date=template_date,
                        exists=_event_exists_for_template_date(db, template, template_date),
                    )
                ]
            return GenerateAnnualPreviewOut(
                preview=True,
                year=payload.year,
                dates=preview_dates,
            )

        if not template_date:
            return GenerateAnnualEventsFromTemplateOut(
                created=0,
                skipped=0,
                dates=[],
            )

        if _event_exists_for_template_date(db, template, template_date):
            return GenerateAnnualEventsFromTemplateOut(
                created=0,
                skipped=1,
                dates=[template_date],
            )

        _create_event_from_template_date(db, template, template_date)
        return GenerateAnnualEventsFromTemplateOut(
            created=1,
            skipped=0,
            dates=[template_date],
        )

    try:
        rule_dates = generate_dates_from_template(template, payload.year)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.preview:
        preview_dates = [
            GenerateAnnualPreviewDateOut(
                date=target_date,
                exists=_event_exists_for_template_date(db, template, target_date),
            )
            for target_date in rule_dates
        ]
        return GenerateAnnualPreviewOut(
            preview=True,
            year=payload.year,
            dates=preview_dates,
        )

    created = 0
    skipped = 0

    for target_date in rule_dates:
        if _event_exists_for_template_date(db, template, target_date):
            skipped += 1
            continue

        _create_event_from_template_date(db, template, target_date)
        created += 1

    return GenerateAnnualEventsFromTemplateOut(
        created=created,
        skipped=skipped,
        dates=rule_dates,
    )


def _get_template_or_404(db: Session, template_id: UUID) -> EventTemplate:
    template = db.query(EventTemplate).filter(EventTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Event template not found")
    return template


def _create_event_from_template_date(db: Session, template: EventTemplate, target_date):
    event_in = EventCreate(
        template_id=template.id,
        title=template.name,
        event_type=template.event_type,
        start_date=target_date,
        start_time=template.default_start_time,
        end_time=template.default_end_time,
        venue=template.location,
        city=template.city,
        state=template.state,
        latitude=template.latitude,
        longitude=template.longitude,
        beach_accessibility=template.beach_accessibility,
        beach_access_notes=template.beach_access_notes,
        directions=template.directions,
        parking_info=template.parking_info,
        lodging_info=template.lodging_info,
        map_url=template.map_url,
        weather_report_url=template.weather_report_url,
        surf_report_url=template.surf_report_url,
        featured_image=template.featured_image,
        internal_notes=template.internal_notes,
        participant_capacity=template.capacity,
        volunteer_capacity=template.volunteer_capacity,
        status="draft",
    )

    event = crud_create_event(db, event_in)
    event.status = "draft"
    event.template_id = template.id
    db.commit()
    db.refresh(event)
    return event


def _event_exists_for_template_date(db: Session, template: EventTemplate, target_date) -> bool:
    existing = (
        db.query(Event.id)
        .filter(
            Event.start_date == target_date,
            ((Event.template_id == template.id) | (Event.title == template.name)),
        )
        .first()
    )
    return existing is not None