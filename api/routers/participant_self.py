import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_permission
from api.models.users import User
from api.schemas.participants import MyRegistrationOut, ParticipantOut
from api.services.authorization import PERMISSION_PARTICIPANTS_VIEW_OWN
from api.services.capability_resolution import resolve_capabilities_with_context, resolve_person_for_user
from api.services.participant_identity import get_own_participant_or_404, list_own_registrations
from api.services.waiver_lifecycle import STATUS_SIGNED, derive_participant_waiver_status

router = APIRouter(prefix="/participants", tags=["Participant Self-Service"])

logger = logging.getLogger(__name__)


def _shadow_check_participants_view_own(db: Session, current_user: User) -> bool:
    """Phase 3B Slice B6 - observer only, never an actor.

    Reaching this point already means legacy authorization
    (require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN), evaluated
    before this function is ever called) allowed the request - that
    decision is already made and cannot be changed by anything below.
    This function independently asks the capability engine
    (api/services/capability_resolution.py, Slice B5) the same
    question, compares the two answers, and - on a mismatch only -
    logs structured diagnostic detail. It never raises, never returns
    anything the caller acts on, and never touches the response. Any
    error in this function is caught and logged, never allowed to
    affect the request it's shadowing.
    """
    check_id = uuid.uuid4()

    try:
        legacy_decision = True  # implied by having reached this point at all

        person = resolve_person_for_user(db, current_user)
        granted, context = resolve_capabilities_with_context(db, user=current_user)
        engine_decision = PERMISSION_PARTICIPANTS_VIEW_OWN in granted

        if engine_decision == legacy_decision:
            return True

        logger.warning(
            "capability_engine_shadow_mismatch check_id=%s endpoint=%s permission=%s "
            "user_id=%s person_id=%s legacy_decision=%s engine_decision=%s "
            "used_legacy_fallback=%s role_codes=%s",
            check_id,
            "GET /api/participants/mine",
            PERMISSION_PARTICIPANTS_VIEW_OWN,
            current_user.id,
            person.id if person is not None else None,
            legacy_decision,
            engine_decision,
            context.used_legacy_fallback,
            list(context.role_codes),
        )
        return False
    except Exception:  # noqa: BLE001 - shadow check must never affect the real request
        logger.warning(
            "capability_engine_shadow_check_error check_id=%s endpoint=%s user_id=%s",
            check_id,
            "GET /api/participants/mine",
            getattr(current_user, "id", None),
            exc_info=True,
        )
        return True


def _waiver_status_label(participant) -> str:
    if participant.waiver is None:
        return "not_required"

    derived = derive_participant_waiver_status(
        waiver=participant.waiver,
        waiver_signed=participant.waiver_signed,
        waiver_verified=participant.waiver_verified,
    )
    return "signed" if derived == STATUS_SIGNED else "pending"


# "My Registrations" — must be declared before /{participant_id} below so
# "mine" isn't swallowed as an (invalid) UUID path parameter by that route.
@router.get("/mine", response_model=list[MyRegistrationOut])
def list_my_registrations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)),
):
    # Slice B6 shadow-check: observes and logs on mismatch only, never
    # alters this request. See _shadow_check_participants_view_own's
    # docstring. The dependency above is unchanged and remains the sole
    # enforcement point for this endpoint.
    _shadow_check_participants_view_own(db, current_user)

    participants = list_own_registrations(db, current_user=current_user)

    return [
        {
            "id": participant.id,
            "is_waitlisted": participant.is_waitlisted,
            "checked_in": participant.checked_in,
            "waiver_status": _waiver_status_label(participant),
            "created_at": participant.created_at,
            "event": {
                "id": participant.event.id,
                "title": participant.event.title,
                "slug": participant.event.slug,
                "start_date": participant.event.start_date,
                "end_date": participant.event.end_date,
                "location": {
                    "venue": participant.event.venue,
                    "city": participant.event.city,
                    "state": participant.event.state,
                    "latitude": participant.event.latitude,
                    "longitude": participant.event.longitude,
                    "beach_accessibility": participant.event.beach_accessibility,
                },
            },
        }
        for participant in participants
    ]


# Minimal self-service read, scoped to a single record the caller owns.
@router.get("/{participant_id}", response_model=ParticipantOut)
def get_own_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)),
):
    return get_own_participant_or_404(db, participant_id=participant_id, current_user=current_user)
