
from datetime import time
from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from api.crud.participants import promote_from_waitlist
from api.db.session import get_db
from api.dependencies import require_admin
from api.models.events import Event
from api.models.event_templates import EventTemplate
from api.schemas.event_templates import EventTemplateCreate, EventTemplateOut
from api.schemas.events import AdminEventListOut, EventOut, EventUpdate, EventCreate
from api.crud.events import (
    create_event as crud_create_event,
    update_event as crud_update_event,
    auto_publish_and_open_participant_registration,
)
from sqlalchemy.orm import joinedload
from api.schemas.participants import AdminParticipantListOut, ParticipantOut
from api.utils.event_builder import build_admin_event
from api.models.participants import Participant
from api.schemas.events import AdminEventSummary
from datetime import datetime
import logging
from api.services.no_show_service import get_no_show_candidates, promote_no_show_slots
from api.models.participant_removal_log import ParticipantRemovalLog

router = APIRouter(
    prefix="/admin/events",
    tags=["Admin Events"],
)

STRICT_TEMPLATE_ENFORCEMENT = False
logger = logging.getLogger(__name__)


class SaveEventAsTemplateIn(BaseModel):
    template_name: str | None = None
    schedule_rule_type: str | None = None
    schedule_months: list[int] | None = None
    schedule_weekday: int | None = None
    schedule_week_numbers: list[int] | None = None


# --- No-show endpoints must be after router is defined ---
from typing import List as TypingList
# 🔹 Get no-show candidates for an event
@router.get("/{event_id}/no_shows", response_model=TypingList[str])
def get_no_shows(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    candidates = get_no_show_candidates(db, event_id)
    return [str(p.id) for p in candidates] if candidates else []

# 🔹 Manually promote waitlisted participants for no-show slots
@router.post("/{event_id}/promote_no_shows", response_model=TypingList[str])
def promote_no_shows(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    promoted = promote_no_show_slots(db, event_id)
    return [str(p.id) for p in promoted] if promoted else []


@router.get("/{event_id}/no_shows/removed_count")
def get_removed_no_show_count(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    count = (
        db.query(ParticipantRemovalLog)
        .filter(
            ParticipantRemovalLog.event_id == str(event_id),
            ParticipantRemovalLog.removed_reason_code == "no_show",
        )
        .count()
    )
    return {"count": count}

#🔹 Create new event
@router.post("/", response_model=EventOut, status_code=201)
def create_event(
    event_in: EventCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    template = None

    if STRICT_TEMPLATE_ENFORCEMENT and not event_in.template_id:
        logger.warning("Invalid event creation attempt: missing template_id in strict mode payload=%s", event_in.model_dump())
        raise HTTPException(
            status_code=400,
            detail="template_id is required when creating an event",
        )

    if event_in.template_id:
        template = db.query(EventTemplate).filter(EventTemplate.id == event_in.template_id).first()
        if not template:
            logger.warning("Invalid event creation attempt: unknown template_id payload=%s", event_in.model_dump())
            raise HTTPException(status_code=404, detail="Invalid template_id")

        if event_in.event_type != template.event_type:
            logger.warning("Invalid event creation attempt: event_type mismatch payload=%s", event_in.model_dump())
            raise HTTPException(status_code=400, detail="Event type must match template event type")

        event_in.template_id = template.id

    event = crud_create_event(db, event_in)

    return build_admin_event(event)


@router.post("/{event_id}/duplicate", response_model=EventOut, status_code=201)
def duplicate_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    source_event = db.query(Event).filter(Event.id == event_id).first()
    if not source_event:
        raise HTTPException(status_code=404, detail="Event not found")

    duplicate_payload = EventCreate(
        title=source_event.title,
        event_type=source_event.event_type,
        start_date=source_event.start_date,
        end_date=source_event.end_date,
        start_time=source_event.start_time,
        end_time=source_event.end_time,
        timezone=source_event.timezone,
        venue=source_event.venue,
        city=source_event.city,
        state=source_event.state,
        latitude=source_event.latitude,
        longitude=source_event.longitude,
        beach_accessibility=source_event.beach_accessibility,
        beach_access_notes=source_event.beach_access_notes,
        directions=source_event.directions,
        parking_info=source_event.parking_info,
        lodging_info=source_event.lodging_info,
        map_url=source_event.map_url,
        weather_report_url=source_event.weather_report_url,
        surf_report_url=source_event.surf_report_url,
        internal_notes=source_event.internal_notes,
        participant_capacity=source_event.participant_capacity,
        volunteer_capacity=source_event.volunteer_capacity,
        participant_open=source_event.participant_open,
        volunteer_open=source_event.volunteer_open,
        exhibitor_open=source_event.exhibitor_open,
        website_schedule_published=source_event.website_schedule_published,
        featured_image=source_event.featured_image,
        no_show_minutes=source_event.no_show_minutes,
        status="draft",
    )

    duplicated_event = crud_create_event(db, duplicate_payload)

    # Ensure duplicated events always start as draft.
    duplicated_event.status = "draft"
    db.commit()
    db.refresh(duplicated_event)

    return build_admin_event(duplicated_event)


@router.post("/{event_id}/save-as-template", response_model=EventTemplateOut, status_code=201)
def save_event_as_template(
    event_id: UUID,
    payload: SaveEventAsTemplateIn | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.sessions))
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    ordered_sessions = sorted(
        list(event.sessions or []),
        key=lambda session: (
            session.start_time.isoformat() if session.start_time else "",
            str(session.id),
        ),
    )

    session_count = max(len(ordered_sessions), 1)
    first_session = ordered_sessions[0] if ordered_sessions else None
    first_session_capacity = int(first_session.capacity) if first_session and first_session.capacity else None

    schedule_rule_type = payload.schedule_rule_type if payload and payload.schedule_rule_type is not None else "nth_weekday"
    schedule_months = payload.schedule_months if payload and payload.schedule_months is not None else [5, 6, 7, 8, 9]
    schedule_weekday = payload.schedule_weekday if payload and payload.schedule_weekday is not None else 5
    schedule_week_numbers = payload.schedule_week_numbers if payload and payload.schedule_week_numbers is not None else [2, 3]
    weather_report_url = event.weather_report_url
    if not weather_report_url and event.latitude is not None and event.longitude is not None:
        weather_report_url = f"https://forecast.weather.gov/MapClick.php?lat={event.latitude}&lon={event.longitude}"

    template_in = EventTemplateCreate(
        name=(payload.template_name.strip() if payload and payload.template_name else event.title),
        location=event.venue or "TBD",
        capacity=event.participant_capacity or first_session_capacity or 15,
        event_type=event.event_type,
        default_start_time=event.start_time or (first_session.start_time.time() if first_session and first_session.start_time else time(9, 0)),
        default_end_time=event.end_time or (first_session.end_time.time() if first_session and first_session.end_time else time(12, 0)),
        session_count=session_count,
        session_capacity=first_session_capacity or 15,
        schedule_rule_type=schedule_rule_type,
        schedule_months=schedule_months,
        schedule_weekday=schedule_weekday,
        schedule_week_numbers=schedule_week_numbers,
        volunteer_capacity=event.volunteer_capacity,
        featured_image=event.featured_image,
        city=event.city,
        state=event.state,
        latitude=event.latitude,
        longitude=event.longitude,
        beach_accessibility=event.beach_accessibility if event.beach_accessibility is not None else True,
        beach_access_notes=event.beach_access_notes,
        directions=event.directions,
        parking_info=event.parking_info,
        lodging_info=event.lodging_info,
        map_url=event.map_url,
        weather_report_url=weather_report_url,
        surf_report_url=event.surf_report_url,
        internal_notes=event.internal_notes,
    )

    template = EventTemplate(**template_in.model_dump())

    db.add(template)
    db.commit()
    db.refresh(template)
    return template

#🔹 Get event details (admin view)
@router.get("/{event_id}", response_model=AdminEventListOut)
def get_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    auto_publish_and_open_participant_registration(db)

    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participant_count = len(
        [p for p in event.participants if p.removed_at is None and not p.is_waitlisted]
    )

    waitlist_count = len(
        [p for p in event.participants if p.removed_at is None and p.is_waitlisted]
    )

    checked_in_count = len(
        [p for p in event.participants if p.removed_at is None and p.checked_in]
    )

    return build_admin_event(event)

# 🔹 Get event summary
@router.get("/{event_id}/summary", response_model=AdminEventSummary)
def event_summary(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    auto_publish_and_open_participant_registration(db)

    from sqlalchemy.orm import joinedload

    event = (
        db.query(Event)
        .options(joinedload(Event.participants))
        .filter(Event.id == event_id)
        .first()
    )

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = [p for p in event.participants if p.removed_at is None]

    registered = 0
    waitlisted = 0
    checked_in = 0
    cleared_to_participate = 0
    volunteers = 0
    waivers_missing = 0
    versatile_volunteer_count = 0
    volunteer_type_counts = {
        "food": 0,
        "raffle": 0,
        "buddy": 0,
        "instructor": 0,
        "spotter": 0,
        "board_rescue": 0,
        "lifeguard": 0,
        "registration": 0,
        "setup_teardown": 0,
        "equipment_handling": 0,
        "snacks_drinks": 0,
    }
    volunteer_group_counts = {
        "beach": 0,
        "water": 0,
    }
    volunteer_flexible_group_counts = {
        "beach": 0,
        "water": 0,
    }
    water_group_roles = {"buddy", "instructor", "spotter", "board_rescue", "lifeguard"}
    beach_group_roles = {"food", "raffle", "beach", "registration", "setup_teardown", "equipment_handling", "snacks_drinks"}

    for p in participants:
        is_volunteer = (p.role or "").strip().lower() == "volunteer"

        if is_volunteer:
            volunteers += 1
            if p.volunteer_is_versatile:
                versatile_volunteer_count += 1
            selected_roles = set()

            primary = (p.volunteer_type or "").strip().lower()
            primary = {"surf_buddy": "buddy", "surf_instructor": "instructor"}.get(primary, primary)
            if primary:
                selected_roles.add(primary)

            for role in (p.volunteer_additional_types or []):
                normalized = str(role or "").strip().lower()
                normalized = {"surf_buddy": "buddy", "surf_instructor": "instructor"}.get(normalized, normalized)
                if normalized:
                    selected_roles.add(normalized)

            for role in selected_roles:
                if role in volunteer_type_counts:
                    volunteer_type_counts[role] += 1

            # Group totals are separate from role totals.
            if selected_roles.intersection(beach_group_roles):
                volunteer_group_counts["beach"] += 1
                if p.volunteer_is_versatile:
                    volunteer_flexible_group_counts["beach"] += 1
            if selected_roles.intersection(water_group_roles):
                volunteer_group_counts["water"] += 1
                if p.volunteer_is_versatile:
                    volunteer_flexible_group_counts["water"] += 1
            continue

        if p.is_waitlisted:
            waitlisted += 1
        else:
            registered += 1

        if p.checked_in:
            checked_in += 1

        if p.checked_in and p.waiver_verified:
            cleared_to_participate += 1

        if not p.waiver_verified:
            waivers_missing += 1

    participant_remaining = None
    participant_fill_percent = None
    volunteer_remaining = None
    volunteer_fill_percent = None

    if event.participant_capacity:
        participant_remaining = max(
            event.participant_capacity - registered, 0
        )

        participant_fill_percent = round(
            (registered / event.participant_capacity) * 100, 2
        )

    return {
        "event_id": event.id,
        "title": event.title,
        "status": event.status,

        "registered_count": registered,
        "cleared_to_participate_count": cleared_to_participate,
        "participant_count": registered,
        "waitlist_count": waitlisted,
        "checked_in_count": checked_in,
        "waivers_missing": waivers_missing,

        "participant_capacity": event.participant_capacity,
        "participant_remaining": participant_remaining,
        "participant_fill_percent": participant_fill_percent,

        "volunteer_count": volunteers,
        "volunteer_capacity": event.volunteer_capacity,
        "volunteer_remaining": volunteer_remaining,
        "volunteer_fill_percent": volunteer_fill_percent,
        "volunteer_type_counts": volunteer_type_counts,
        "volunteer_group_counts": volunteer_group_counts,
        "volunteer_flexible_group_counts": volunteer_flexible_group_counts,
        "versatile_volunteer_count": versatile_volunteer_count,
}

# 🔹 List all events (admin view)
@router.get("/", response_model=List[AdminEventListOut])
def list_all_events(
    skip: int = 0,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    auto_publish_and_open_participant_registration(db)

    query = db.query(Event).options(joinedload(Event.participants))

    if status:
        query = query.filter(Event.status == status)

    events = query.order_by(Event.start_date.asc()).all()

    return [build_admin_event(e) for e in events]


# 🔹 Update event
@router.put("/{event_id}", response_model=AdminEventListOut)
def update_event(
    event_id: UUID,
    update_data: EventUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = (
    db.query(Event)
    .options(joinedload(Event.participants))
    .filter(Event.id == event_id)
    .first()
)

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    event = crud_update_event(db, event, update_data)
    
    return build_admin_event(event)

# 🔹 Delete event
@router.delete("/{event_id}")
def delete_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(event)
    db.commit()

    return {"message": "Event deleted"}

# 🔹 List participants for an event (admin view)
@router.get("/{event_id}/participants",)
def list_event_participants(
    event_id: UUID,
    checked_in: bool | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    query = db.query(Participant).filter(
        Participant.event_id == event_id,
        Participant.removed_at.is_(None),
    )

    if checked_in is not None:
        query = query.filter(Participant.checked_in == checked_in)

    return query.all()

@router.get("/participants", response_model=List[AdminParticipantListOut])
def list_all_participants(
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    participants = db.query(Participant).options(joinedload(Participant.event)).filter(Participant.removed_at.is_(None)).all()

    return [
        {
            "id": p.id,
            "event_id": p.event_id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "email": p.email,
            "role": p.role,
            "is_minor": p.is_minor,
            "checked_in": p.checked_in,
            "is_waitlisted": p.is_waitlisted,
            "priority": p.priority,
            "waiver_signed": p.waiver_signed,
            "waiver_verified": p.waiver_verified,
            "event_title": p.event.title if p.event else None,
            "event_type": p.event.event_type if p.event else None,
            "volunteer_type": p.volunteer_type,
            "volunteer_additional_types": p.volunteer_additional_types or [],
            "volunteer_is_versatile": p.volunteer_is_versatile,
        }
        for p in participants
    ]


