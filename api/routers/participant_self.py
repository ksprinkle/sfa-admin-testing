from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_permission
from api.models.users import User
from api.schemas.participants import MyRegistrationOut, ParticipantOut
from api.services.authorization import PERMISSION_PARTICIPANTS_VIEW_OWN
from api.services.participant_identity import get_own_participant_or_404, list_own_registrations
from api.services.waiver_lifecycle import STATUS_SIGNED, derive_participant_waiver_status

router = APIRouter(prefix="/participants", tags=["Participant Self-Service"])


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
