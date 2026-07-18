from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from api.models.participants import Participant
from api.models.users import User
from api.schemas.participants import ParticipantCreate, PublicEventRegister
from api.services.public_registration import register_public_participant
from api.services.waiver_signing import create_signing_token
from api.services.waiver_template_lifecycle import get_active_template

# Matches WaiverCreateTokenIn's admin-issued-token default (api/schemas/waivers.py) —
# no new expiry policy introduced, just reused for the auto-issued case.
DEFAULT_AUTO_WAIVER_EXPIRES_MINUTES = 1440


@dataclass
class PublicOnboardingResult:
    participant: Participant
    waiver_required: bool
    waiver_signing_token: str | None = None
    waiver_signing_path: str | None = None
    waiver_expires_at: datetime | None = None


# Orchestrates two existing, single-responsibility services — it contains no
# registration or waiver business logic of its own. register_public_participant()
# (api/services/public_registration.py) and create_signing_token()
# (api/services/waiver_signing.py) are unchanged and reused as-is, exactly as an
# admin issuing a token for an already-registered participant would use the
# latter. "Waiver required" here means "an active WaiverTemplate exists" — the
# codebase has no separate per-event/per-role waiver-required flag to check.
def complete_public_registration(
    db: Session,
    slug: str,
    participant_in: ParticipantCreate | PublicEventRegister,
    *,
    current_user: User | None = None,
) -> PublicOnboardingResult:
    participant = register_public_participant(db, slug, participant_in, current_user=current_user)

    active_template = get_active_template(db)
    if active_template is None:
        return PublicOnboardingResult(participant=participant, waiver_required=False)

    token_record, raw_token = create_signing_token(
        db,
        participant=participant,
        expires_in_minutes=DEFAULT_AUTO_WAIVER_EXPIRES_MINUTES,
        actor_user_id=None,
        waiver_version=None,
        note="Issued automatically at public registration",
    )

    return PublicOnboardingResult(
        participant=participant,
        waiver_required=True,
        waiver_signing_token=raw_token,
        waiver_signing_path=f"/api/waivers/sign/{raw_token}",
        waiver_expires_at=token_record.expires_at,
    )
