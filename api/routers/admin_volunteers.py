from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_permission
from api.schemas.volunteer_lifecycle import (
    VolunteerAssignmentCreateIn,
    VolunteerAssignmentOut,
    VolunteerAvailabilityCreateIn,
    VolunteerAvailabilityOut,
    VolunteerProfileCreateIn,
    VolunteerProfileLifecycleUpdateIn,
    VolunteerProfileOut,
)
from api.services.authorization import PERMISSION_VOLUNTEERS_MANAGE
from api.services.volunteer_lifecycle import (
    add_volunteer_availability,
    create_volunteer_assignment,
    create_volunteer_profile,
    list_volunteer_assignments,
    list_volunteer_availability,
    list_volunteer_profiles,
    remove_volunteer_assignment,
    update_volunteer_lifecycle_status,
)


router = APIRouter(prefix="/admin/volunteers", tags=["Admin Volunteers"])


@router.post("/profiles", response_model=VolunteerProfileOut, status_code=201)
def create_profile(
    payload: VolunteerProfileCreateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_VOLUNTEERS_MANAGE)),
):
    return create_volunteer_profile(
        db,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        skills=payload.skills,
        certifications=payload.certifications,
        notes=payload.notes,
        actor_user_id=current_user.id,
    )


@router.get("/profiles", response_model=list[VolunteerProfileOut])
def get_profiles(
    lifecycle_status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_VOLUNTEERS_MANAGE)),
):
    return list_volunteer_profiles(db, lifecycle_status=lifecycle_status)


@router.put("/profiles/{volunteer_id}/lifecycle", response_model=VolunteerProfileOut)
def update_profile_lifecycle(
    volunteer_id: UUID,
    payload: VolunteerProfileLifecycleUpdateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_VOLUNTEERS_MANAGE)),
):
    return update_volunteer_lifecycle_status(
        db,
        volunteer_id=volunteer_id,
        lifecycle_status=payload.lifecycle_status,
        actor_user_id=current_user.id,
    )


@router.post("/profiles/{volunteer_id}/availability", response_model=VolunteerAvailabilityOut, status_code=201)
def create_availability(
    volunteer_id: UUID,
    payload: VolunteerAvailabilityCreateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_VOLUNTEERS_MANAGE)),
):
    return add_volunteer_availability(
        db,
        volunteer_id=volunteer_id,
        weekday=payload.weekday,
        availability_date=payload.availability_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        availability_status=payload.availability_status,
        notes=payload.notes,
        actor_user_id=current_user.id,
    )


@router.get("/profiles/{volunteer_id}/availability", response_model=list[VolunteerAvailabilityOut])
def get_availability(
    volunteer_id: UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_VOLUNTEERS_MANAGE)),
):
    return list_volunteer_availability(db, volunteer_id=volunteer_id)


@router.post("/assignments", response_model=VolunteerAssignmentOut, status_code=201)
def create_assignment(
    payload: VolunteerAssignmentCreateIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_VOLUNTEERS_MANAGE)),
):
    return create_volunteer_assignment(
        db,
        volunteer_id=payload.volunteer_id,
        event_id=payload.event_id,
        session_id=payload.session_id,
        assignment_role=payload.assignment_role,
        notes=payload.notes,
        actor_user_id=current_user.id,
    )


@router.get("/assignments", response_model=list[VolunteerAssignmentOut])
def get_assignments(
    volunteer_id: UUID | None = None,
    event_id: UUID | None = None,
    db: Session = Depends(get_db),
    _current_user=Depends(require_permission(PERMISSION_VOLUNTEERS_MANAGE)),
):
    return list_volunteer_assignments(db, volunteer_id=volunteer_id, event_id=event_id)


@router.delete("/assignments/{assignment_id}", status_code=204)
def cancel_assignment(
    assignment_id: UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission(PERMISSION_VOLUNTEERS_MANAGE)),
):
    remove_volunteer_assignment(db, assignment_id=assignment_id, actor_user_id=current_user.id)
    return None
