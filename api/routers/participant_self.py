import logging
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_capability
from api.models.participants import Participant
from api.models.users import User
from api.schemas.participants import MyRegistrationOut, ParticipantOut
from api.services.authorization import PERMISSION_PARTICIPANTS_VIEW_OWN
from api.services.capability_resolution import (
    resolve_capabilities_with_context,
    resolve_manageable_person_ids,
    resolve_person_for_user,
)
from api.services.participant_identity import get_own_participant_or_404, list_own_registrations
from api.services.waiver_lifecycle import STATUS_SIGNED, derive_participant_waiver_status

router = APIRouter(prefix="/participants", tags=["Participant Self-Service"])

logger = logging.getLogger(__name__)


def _shadow_check_participants_view_own(db: Session, current_user: User) -> bool:
    """Phase 3B Slice B6 - observer only, never an actor.

    RETIRED as of Phase 3C Slice B9 (see PHASE3C_SLICE_B9_ARCHITECTURE_
    REVIEW.md §5): this endpoint's dependency is now require_capability()
    below, so there is no separate legacy decision left to shadow. Kept,
    unmodified and uncalled, only because tests/test_shadow_check_
    participants_mine.py exercises it directly as historical evidence
    that the capability engine agreed with legacy authorization
    throughout B6's production observation window - the equivalence
    proof that made B9's direct replacement safe. Not part of any
    request path.

    Original docstring, describing its behavior while still live:
    reaching this point already meant legacy authorization
    (require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN), evaluated
    before this function was ever called) allowed the request - that
    decision was already made and could not be changed by anything
    below. This function independently asked the capability engine
    (api/services/capability_resolution.py, Slice B5) the same
    question, compared the two answers, and - on a mismatch only -
    logged structured diagnostic detail. It never raised, never returned
    anything the caller acted on, and never touched the response.
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


def _shadow_check_list_own_registrations(
    db: Session, *, current_user: User, legacy_participants: list[Participant]
) -> None:
    """Phase 3C Slice B13c - observer only, never an actor.

    Compares the ownership engine's answer (api/services/
    capability_resolution.py::resolve_manageable_person_ids(), Slice
    B13b) against list_own_registrations()'s existing Participant.user_id
    -based result for GET /api/participants/mine, logging only on
    disagreement. Repeats the B6 shadow-validation pattern exactly:
    called from the route body, its return value is never consumed, and
    it can never raise or otherwise affect the response - a caught
    internal error is itself just another logged event, not a re-raise.

    Deliberately reproduces today's behavior warts and all - if a
    Participant's person_id was mis-stamped by the registration flow
    (the B14 identity-claim gap), both the legacy query and the engine
    read that same stored value, so they still agree. This function
    proves the engine matches production today; it says nothing about
    whether today's stored values are the ones a later slice (B14)
    should have written.
    """
    check_id = uuid.uuid4()
    endpoint = "GET /api/participants/mine"

    try:
        manageable_person_ids = resolve_manageable_person_ids(db, current_user)

        engine_ids: set = set()
        if manageable_person_ids:
            engine_ids = {
                row[0]
                for row in db.query(Participant.id)
                .filter(
                    Participant.person_id.in_(manageable_person_ids),
                    Participant.removed_at.is_(None),
                )
                .all()
            }

        legacy_ids = {participant.id for participant in legacy_participants}

        if engine_ids == legacy_ids:
            return

        logger.warning(
            "ownership_engine_shadow_mismatch check_id=%s endpoint=%s user_id=%s "
            "legacy_ids=%s engine_ids=%s missing_from_engine=%s extra_in_engine=%s",
            check_id,
            endpoint,
            current_user.id,
            sorted(str(i) for i in legacy_ids),
            sorted(str(i) for i in engine_ids),
            sorted(str(i) for i in legacy_ids - engine_ids),
            sorted(str(i) for i in engine_ids - legacy_ids),
        )
    except Exception:  # noqa: BLE001 - shadow check must never affect the real request
        logger.warning(
            "ownership_engine_shadow_check_error check_id=%s endpoint=%s user_id=%s",
            check_id,
            endpoint,
            getattr(current_user, "id", None),
            exc_info=True,
        )


def _shadow_check_get_own_participant(
    db: Session, *, current_user: User, participant_id: UUID, legacy_found: bool
) -> None:
    """Phase 3C Slice B13c - the single-record counterpart of
    _shadow_check_list_own_registrations() above, for GET
    /api/participants/{participant_id}. `legacy_found` is the caller's
    already-decided outcome (whether get_own_participant_or_404() found
    the record or raised 404) - this function never re-derives or
    second-guesses it, only compares the engine's independent answer
    against it.
    """
    check_id = uuid.uuid4()
    endpoint = "GET /api/participants/{participant_id}"

    try:
        manageable_person_ids = resolve_manageable_person_ids(db, current_user)

        participant = (
            db.query(Participant)
            .filter(Participant.id == participant_id, Participant.removed_at.is_(None))
            .first()
        )
        engine_found = participant is not None and participant.person_id in manageable_person_ids

        if engine_found == legacy_found:
            return

        logger.warning(
            "ownership_engine_shadow_mismatch check_id=%s endpoint=%s user_id=%s "
            "participant_id=%s person_id=%s legacy_decision=%s engine_decision=%s",
            check_id,
            endpoint,
            current_user.id,
            participant_id,
            participant.person_id if participant is not None else None,
            legacy_found,
            engine_found,
        )
    except Exception:  # noqa: BLE001 - shadow check must never affect the real request
        logger.warning(
            "ownership_engine_shadow_check_error check_id=%s endpoint=%s user_id=%s participant_id=%s",
            check_id,
            endpoint,
            getattr(current_user, "id", None),
            participant_id,
            exc_info=True,
        )


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
    current_user: User = Depends(require_capability(PERMISSION_PARTICIPANTS_VIEW_OWN)),
):
    # Phase 3C Slice B9: this is the first endpoint whose authorization
    # is decided solely by the Capability Resolution Engine (via
    # require_capability() above) rather than legacy has_permission().
    # See PHASE3C_SLICE_B9_ARCHITECTURE_REVIEW.md.
    participants = list_own_registrations(db, current_user=current_user)

    _shadow_check_list_own_registrations(db, current_user=current_user, legacy_participants=participants)

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
# Phase 3C Slice B10: second endpoint decided solely by the Capability
# Resolution Engine (require_capability()), reusing the same permission
# already proven live by B9 on GET /participants/mine. See
# PHASE3C_SLICE_B10_ARCHITECTURE_REVIEW.md.
@router.get("/{participant_id}", response_model=ParticipantOut)
def get_own_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability(PERMISSION_PARTICIPANTS_VIEW_OWN)),
):
    try:
        participant = get_own_participant_or_404(db, participant_id=participant_id, current_user=current_user)
    except HTTPException:
        _shadow_check_get_own_participant(
            db, current_user=current_user, participant_id=participant_id, legacy_found=False
        )
        raise

    _shadow_check_get_own_participant(
        db, current_user=current_user, participant_id=participant_id, legacy_found=True
    )
    return participant
