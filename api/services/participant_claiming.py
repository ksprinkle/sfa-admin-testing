from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func
from sqlalchemy.orm import Session

from api.models.participants import Participant
from api.models.users import User
from api.services.admin_audit import record_admin_audit_event
from api.utils.email_normalization import normalize_email

CLAIM_DOMAIN = "participants"
CLAIM_ACTION = "participant_account_claimed"
CLAIM_SOURCE = "account_verification"


@dataclass
class ClaimResult:
    count: int = 0
    participant_ids: list[str] = field(default_factory=list)


def claim_participants_for_user(db: Session, user: User) -> ClaimResult:
    normalized_email = normalize_email(user.email)

    matches = (
        db.query(Participant)
        .filter(
            Participant.user_id.is_(None),
            func.lower(func.trim(Participant.email)) == normalized_email,
        )
        .all()
    )

    result = ClaimResult()

    for participant in matches:
        participant.user_id = user.id
        result.count += 1
        result.participant_ids.append(str(participant.id))

        record_admin_audit_event(
            db,
            domain=CLAIM_DOMAIN,
            action=CLAIM_ACTION,
            actor_user_id=user.id,
            target_type="participant",
            target_id=str(participant.id),
            target_display=participant.email,
            source=CLAIM_SOURCE,
            details={
                "participant_id": str(participant.id),
                "user_id": user.id,
                "email": normalized_email,
            },
        )

    return result
