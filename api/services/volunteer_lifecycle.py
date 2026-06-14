from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.models.volunteer_assignments import VolunteerAssignment
from api.models.volunteer_availabilities import VolunteerAvailability
from api.models.volunteer_profiles import VolunteerProfile
from api.services.admin_audit import record_admin_audit_event


VALID_VOLUNTEER_STATUSES = {
    VolunteerProfile.STATUS_ACTIVE,
    VolunteerProfile.STATUS_INACTIVE,
    VolunteerProfile.STATUS_SUSPENDED,
}

VALID_AVAILABILITY_STATUSES = {"available", "unavailable", "preferred"}


def _normalize_status(value: str | None, default: str) -> str:
    return (value or default).strip().lower() or default


def create_volunteer_profile(
    db: Session,
    *,
    first_name: str,
    last_name: str,
    email: str,
    phone: str | None,
    skills: list[str] | None,
    certifications: list[str] | None,
    notes: str | None,
    actor_user_id: str | None,
) -> VolunteerProfile:
    normalized_email = email.strip().lower()
    existing = (
        db.query(VolunteerProfile)
        .filter(func.lower(VolunteerProfile.email) == normalized_email)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Volunteer email already exists")

    volunteer = VolunteerProfile(
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        email=normalized_email,
        phone=(phone or "").strip() or None,
        lifecycle_status=VolunteerProfile.STATUS_ACTIVE,
        skills=skills or [],
        certifications=certifications or [],
        notes=(notes or "").strip() or None,
        is_active=True,
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    db.add(volunteer)
    db.flush()

    record_admin_audit_event(
        db,
        domain="volunteer",
        action="volunteer_profile_created",
        actor_user_id=actor_user_id,
        target_type="volunteer",
        target_id=str(volunteer.id),
        target_display=volunteer.email,
        source="admin.volunteers.create",
        details={
            "lifecycle_status": volunteer.lifecycle_status,
            "skills_count": len(volunteer.skills or []),
            "certifications_count": len(volunteer.certifications or []),
        },
    )

    db.commit()
    db.refresh(volunteer)
    return volunteer


def list_volunteer_profiles(db: Session, *, lifecycle_status: str | None = None) -> list[VolunteerProfile]:
    query = db.query(VolunteerProfile)
    if lifecycle_status:
        normalized = _normalize_status(lifecycle_status, VolunteerProfile.STATUS_ACTIVE)
        query = query.filter(VolunteerProfile.lifecycle_status == normalized)
    return query.order_by(VolunteerProfile.created_at.desc()).all()


def update_volunteer_lifecycle_status(
    db: Session,
    *,
    volunteer_id: UUID,
    lifecycle_status: str,
    actor_user_id: str | None,
) -> VolunteerProfile:
    volunteer = db.query(VolunteerProfile).filter(VolunteerProfile.id == volunteer_id).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    normalized = _normalize_status(lifecycle_status, VolunteerProfile.STATUS_ACTIVE)
    if normalized not in VALID_VOLUNTEER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid volunteer lifecycle status")

    previous_status = volunteer.lifecycle_status
    volunteer.lifecycle_status = normalized
    volunteer.is_active = normalized == VolunteerProfile.STATUS_ACTIVE
    volunteer.updated_by_user_id = actor_user_id
    volunteer.updated_at = datetime.now(UTC).replace(tzinfo=None)

    record_admin_audit_event(
        db,
        domain="volunteer",
        action="volunteer_lifecycle_updated",
        actor_user_id=actor_user_id,
        target_type="volunteer",
        target_id=str(volunteer.id),
        target_display=volunteer.email,
        source="admin.volunteers.lifecycle",
        details={
            "previous_status": previous_status,
            "new_status": normalized,
        },
    )

    db.commit()
    db.refresh(volunteer)
    return volunteer


def add_volunteer_availability(
    db: Session,
    *,
    volunteer_id: UUID,
    weekday: int | None,
    availability_date,
    start_time,
    end_time,
    availability_status: str,
    notes: str | None,
    actor_user_id: str | None,
) -> VolunteerAvailability:
    volunteer = db.query(VolunteerProfile).filter(VolunteerProfile.id == volunteer_id).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    normalized_status = _normalize_status(availability_status, "available")
    if normalized_status not in VALID_AVAILABILITY_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid availability status")

    if weekday is None and availability_date is None:
        raise HTTPException(status_code=400, detail="Either weekday or availability_date is required")

    availability = VolunteerAvailability(
        volunteer_id=volunteer.id,
        weekday=weekday,
        availability_date=availability_date,
        start_time=start_time,
        end_time=end_time,
        availability_status=normalized_status,
        notes=(notes or "").strip() or None,
    )
    db.add(availability)
    db.flush()

    record_admin_audit_event(
        db,
        domain="volunteer",
        action="volunteer_availability_added",
        actor_user_id=actor_user_id,
        target_type="volunteer",
        target_id=str(volunteer.id),
        target_display=volunteer.email,
        source="admin.volunteers.availability.create",
        details={
            "availability_id": str(availability.id),
            "weekday": availability.weekday,
            "availability_date": availability.availability_date.isoformat() if availability.availability_date else None,
            "availability_status": availability.availability_status,
        },
    )

    db.commit()
    db.refresh(availability)
    return availability


def list_volunteer_availability(db: Session, *, volunteer_id: UUID) -> list[VolunteerAvailability]:
    volunteer = db.query(VolunteerProfile).filter(VolunteerProfile.id == volunteer_id).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    return (
        db.query(VolunteerAvailability)
        .filter(VolunteerAvailability.volunteer_id == volunteer_id)
        .order_by(VolunteerAvailability.created_at.desc())
        .all()
    )


def create_volunteer_assignment(
    db: Session,
    *,
    volunteer_id: UUID,
    event_id: UUID,
    session_id: UUID | None,
    assignment_role: str,
    notes: str | None,
    actor_user_id: str | None,
) -> VolunteerAssignment:
    volunteer = db.query(VolunteerProfile).filter(VolunteerProfile.id == volunteer_id).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    if volunteer.lifecycle_status != VolunteerProfile.STATUS_ACTIVE:
        raise HTTPException(status_code=409, detail="Volunteer is not active")

    role_value = assignment_role.strip().lower()
    if not role_value:
        raise HTTPException(status_code=400, detail="Assignment role is required")

    query = db.query(VolunteerAssignment).filter(
        VolunteerAssignment.volunteer_id == volunteer_id,
        VolunteerAssignment.event_id == event_id,
        VolunteerAssignment.assignment_role == role_value,
    )
    if session_id is None:
        query = query.filter(VolunteerAssignment.session_id.is_(None))
    else:
        query = query.filter(VolunteerAssignment.session_id == session_id)
    existing = query.first()
    if existing:
        raise HTTPException(status_code=409, detail="Duplicate volunteer assignment")

    assignment = VolunteerAssignment(
        volunteer_id=volunteer_id,
        event_id=event_id,
        session_id=session_id,
        assignment_role=role_value,
        status=VolunteerAssignment.STATUS_ASSIGNED,
        notes=(notes or "").strip() or None,
        assigned_by_user_id=actor_user_id,
    )
    db.add(assignment)
    db.flush()

    record_admin_audit_event(
        db,
        domain="volunteer",
        action="volunteer_assignment_created",
        actor_user_id=actor_user_id,
        target_type="assignment",
        target_id=str(assignment.id),
        target_display=volunteer.email,
        source="admin.volunteers.assignments.create",
        details={
            "volunteer_id": str(volunteer_id),
            "event_id": str(event_id),
            "session_id": str(session_id) if session_id else None,
            "assignment_role": assignment.assignment_role,
            "status": assignment.status,
        },
    )

    db.commit()
    db.refresh(assignment)
    return assignment


def list_volunteer_assignments(
    db: Session,
    *,
    volunteer_id: UUID | None = None,
    event_id: UUID | None = None,
) -> list[VolunteerAssignment]:
    query = db.query(VolunteerAssignment)
    if volunteer_id:
        query = query.filter(VolunteerAssignment.volunteer_id == volunteer_id)
    if event_id:
        query = query.filter(VolunteerAssignment.event_id == event_id)
    return query.order_by(VolunteerAssignment.created_at.desc()).all()


def remove_volunteer_assignment(
    db: Session,
    *,
    assignment_id: UUID,
    actor_user_id: str | None,
) -> None:
    assignment = db.query(VolunteerAssignment).filter(VolunteerAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment.status = VolunteerAssignment.STATUS_CANCELLED
    assignment.updated_at = datetime.now(UTC).replace(tzinfo=None)

    record_admin_audit_event(
        db,
        domain="volunteer",
        action="volunteer_assignment_cancelled",
        actor_user_id=actor_user_id,
        target_type="assignment",
        target_id=str(assignment.id),
        source="admin.volunteers.assignments.cancel",
        details={
            "volunteer_id": str(assignment.volunteer_id),
            "event_id": str(assignment.event_id),
            "session_id": str(assignment.session_id) if assignment.session_id else None,
        },
    )

    db.commit()
