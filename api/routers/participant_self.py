from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_permission
from api.models.users import User
from api.schemas.participants import ParticipantOut
from api.services.authorization import PERMISSION_PARTICIPANTS_VIEW_OWN
from api.services.participant_identity import get_own_participant_or_404

router = APIRouter(prefix="/participants", tags=["Participant Self-Service"])


# Minimal self-service read, scoped to a single record the caller owns.
# Not a "my registrations" listing — that's deferred to a later Portal slice.
@router.get("/{participant_id}", response_model=ParticipantOut)
def get_own_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)),
):
    return get_own_participant_or_404(db, participant_id=participant_id, current_user=current_user)
