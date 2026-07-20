from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func
from sqlalchemy.orm import Session

from api.models.participants import Participant
from api.models.person import Person
from api.models.person_relationship import PersonRelationship
from api.models.users import User
from api.services.admin_audit import record_admin_audit_event
from api.utils.email_normalization import normalize_email

CLAIM_DOMAIN = "participants"
CLAIM_ACTION = "participant_account_claimed"
RELATIONSHIP_CLAIM_ACTION = "participant_relationship_claimed"
CLAIM_SOURCE = "account_verification"


@dataclass
class ClaimResult:
    count: int = 0
    participant_ids: list[str] = field(default_factory=list)


def claim_participants_for_user(db: Session, user: User) -> ClaimResult:
    """
    Two independent matching passes, both idempotent and both scoped to
    Participant.user_id IS NULL rows:

    1. Exact-email match (unchanged rule, Slice D) - now also sets
       person_id alongside user_id (Slice B7 Part 1), since the claimed
       participant genuinely is this same person.
    2. Relationship-based match (Slice B7 Part 2, new) - claims a
       participant whose person_id points at someone this user has an
       active, registration-capable PersonRelationship with. This only
       sets user_id (for today's user_id-based ownership/visibility
       model) - person_id is deliberately left untouched, since it
       already correctly identifies the actual registrant (e.g. a
       child), not the claiming account.

    No PersonRelationship rows exist in production yet (Slice B4
    introduced the table with zero backfill/inference, deliberately),
    so pass 2 is real, tested code with no live trigger condition today
    - see PHASE3B_SLICE_B7_VERIFICATION_REPORT.md.
    """
    result = ClaimResult()
    normalized_email = normalize_email(user.email)
    person = db.query(Person).filter(Person.user_id == user.id).first()

    # --- Pass 1: exact-email match ---
    email_matches = (
        db.query(Participant)
        .filter(
            Participant.user_id.is_(None),
            func.lower(func.trim(Participant.email)) == normalized_email,
        )
        .all()
    )

    for participant in email_matches:
        participant.user_id = user.id
        if person is not None:
            participant.person_id = person.id
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

    # --- Pass 2: relationship-based match ---
    # Flush pass 1's updates so this query's `user_id IS NULL` filter
    # never re-matches a row pass 1 already claimed.
    db.flush()

    if person is not None:
        relationship_matches = (
            db.query(Participant)
            .join(
                PersonRelationship,
                PersonRelationship.related_person_id == Participant.person_id,
            )
            .filter(
                Participant.user_id.is_(None),
                Participant.person_id.isnot(None),
                PersonRelationship.subject_person_id == person.id,
                PersonRelationship.status == PersonRelationship.STATUS_ACTIVE,
                PersonRelationship.can_register_for.is_(True),
            )
            .all()
        )

        for participant in relationship_matches:
            participant.user_id = user.id
            # person_id is intentionally left as-is: it already
            # identifies the actual registrant, not the claiming account.
            result.count += 1
            result.participant_ids.append(str(participant.id))

            record_admin_audit_event(
                db,
                domain=CLAIM_DOMAIN,
                action=RELATIONSHIP_CLAIM_ACTION,
                actor_user_id=user.id,
                target_type="participant",
                target_id=str(participant.id),
                target_display=participant.email,
                source=CLAIM_SOURCE,
                details={
                    "participant_id": str(participant.id),
                    "user_id": user.id,
                    "subject_person_id": str(person.id),
                    "related_person_id": str(participant.person_id),
                },
            )

    return result
