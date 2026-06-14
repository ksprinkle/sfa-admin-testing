from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from api.models.participants import Participant
from api.models.participant_waivers import ParticipantWaiver
from api.models.waiver_signing_tokens import WaiverSigningToken
from api.services.waiver_lifecycle import (
    STATUS_SENT,
    STATUS_SIGNED,
    STATUS_VIEWED,
    record_waiver_audit_event,
    transition_waiver_status,
)
from api.services.waiver_template_provenance import get_active_template_snapshot

PUBLIC_SOURCE = "public_signing_link"


def _utcnow() -> datetime:
    return datetime.utcnow()


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _generate_secure_token() -> str:
    return secrets.token_urlsafe(32)


def _new_expiration(expires_in_minutes: int) -> datetime:
    return _utcnow() + timedelta(minutes=expires_in_minutes)


def _ensure_waiver_for_participant(db: Session, participant: Participant) -> ParticipantWaiver:
    waiver = participant.waiver
    if waiver is None:
        waiver = ParticipantWaiver(participant_id=participant.id)
        db.add(waiver)
        db.flush()
    return waiver


def _invalidate_active_tokens(db: Session, waiver: ParticipantWaiver, *, reason: str) -> int:
    now = _utcnow()
    active_tokens = (
        db.query(WaiverSigningToken)
        .filter(
            WaiverSigningToken.waiver_id == waiver.id,
            WaiverSigningToken.status == WaiverSigningToken.STATUS_ACTIVE,
        )
        .all()
    )

    for token in active_tokens:
        token.status = WaiverSigningToken.STATUS_INVALIDATED
        token.invalidated_at = now

    if active_tokens:
        record_waiver_audit_event(
            db,
            waiver,
            event_type="TOKEN_INVALIDATED",
            actor_user_id=None,
            source=PUBLIC_SOURCE,
            details={"count": len(active_tokens), "reason": reason},
        )

    return len(active_tokens)


def create_signing_token(
    db: Session,
    *,
    participant: Participant,
    expires_in_minutes: int,
    actor_user_id: str | None,
    waiver_version: str | None,
    note: str | None,
) -> tuple[WaiverSigningToken, str]:
    waiver = _ensure_waiver_for_participant(db, participant)

    if participant.waiver_verified:
        raise HTTPException(status_code=409, detail="Participant waiver is already signed")

    invalidated_count = _invalidate_active_tokens(db, waiver, reason="new_token_created")

    token_value = ""
    token_hash = ""
    for _ in range(5):
        token_value = _generate_secure_token()
        token_hash = _hash_token(token_value)
        exists = (
            db.query(WaiverSigningToken.id)
            .filter(WaiverSigningToken.token_hash == token_hash)
            .first()
        )
        if not exists:
            break
    else:
        raise HTTPException(status_code=500, detail="Unable to generate secure token")

    now = _utcnow()
    token = WaiverSigningToken(
        waiver_id=waiver.id,
        token_hash=token_hash,
        status=WaiverSigningToken.STATUS_ACTIVE,
        expires_at=_new_expiration(expires_in_minutes),
        created_by_user_id=actor_user_id,
        token_metadata={
            "expires_in_minutes": expires_in_minutes,
            "issued_for": "public_waiver_signing",
        },
    )
    db.add(token)

    if waiver_version:
        waiver.waiver_version = waiver_version.strip() or waiver.waiver_version
    if note:
        waiver.notes = note.strip() or waiver.notes

    transition_waiver_status(
        db,
        waiver,
        to_status=STATUS_SENT,
        actor_user_id=actor_user_id,
        source=PUBLIC_SOURCE,
        event_type="TOKEN_CREATED",
        details={
            "expires_at": token.expires_at.isoformat(),
            "invalidated_prior_tokens": invalidated_count,
        },
        occurred_at=now,
    )

    return token, token_value


def _lookup_token(db: Session, raw_token: str) -> WaiverSigningToken | None:
    token_hash = _hash_token(raw_token)
    return (
        db.query(WaiverSigningToken)
        .options(joinedload(WaiverSigningToken.waiver).joinedload(ParticipantWaiver.participant))
        .filter(WaiverSigningToken.token_hash == token_hash)
        .first()
    )


def get_token_context(db: Session, raw_token: str) -> tuple[WaiverSigningToken | None, ParticipantWaiver | None, Participant | None]:
    token = _lookup_token(db, raw_token)
    if token is None or token.waiver is None:
        return None, None, None
    return token, token.waiver, token.waiver.participant


def validate_token_for_access(
    db: Session,
    *,
    token: WaiverSigningToken,
    waiver: ParticipantWaiver,
    event_type: str,
) -> str:
    now = _utcnow()
    token.last_validated_at = now

    if token.status == WaiverSigningToken.STATUS_COMPLETED:
        record_waiver_audit_event(
            db,
            waiver,
            event_type="TOKEN_VALIDATED",
            actor_user_id=None,
            source=PUBLIC_SOURCE,
            details={"state": "completed"},
        )
        return "completed"

    if token.status == WaiverSigningToken.STATUS_INVALIDATED:
        record_waiver_audit_event(
            db,
            waiver,
            event_type="INVALID_ACCESS",
            actor_user_id=None,
            source=PUBLIC_SOURCE,
            details={"reason": "token_invalidated"},
        )
        return "invalid"

    if token.status == WaiverSigningToken.STATUS_EXPIRED or token.expires_at <= now:
        if token.status != WaiverSigningToken.STATUS_EXPIRED:
            token.status = WaiverSigningToken.STATUS_EXPIRED
            token.invalidated_at = now
            record_waiver_audit_event(
                db,
                waiver,
                event_type="TOKEN_EXPIRED",
                actor_user_id=None,
                source=PUBLIC_SOURCE,
                details={"expired_at": now.isoformat()},
            )

        return "expired"

    record_waiver_audit_event(
        db,
        waiver,
        event_type="TOKEN_VALIDATED",
        actor_user_id=None,
        source=PUBLIC_SOURCE,
        details={"access_type": event_type},
    )
    return "active"


def mark_token_viewed(db: Session, *, token: WaiverSigningToken, waiver: ParticipantWaiver) -> None:
    now = _utcnow()
    if token.first_viewed_at is None:
        token.first_viewed_at = now

    transition_waiver_status(
        db,
        waiver,
        to_status=STATUS_VIEWED,
        actor_user_id=None,
        source=PUBLIC_SOURCE,
        event_type="TOKEN_VIEWED",
        details={"viewed_at": now.isoformat()},
        occurred_at=now,
    )


def complete_public_signing(
    db: Session,
    *,
    token: WaiverSigningToken,
    waiver: ParticipantWaiver,
    participant: Participant,
    signer_name: str | None,
    relationship_to_participant: str | None,
    waiver_version: str | None,
) -> datetime:
    now = _utcnow()

    record_waiver_audit_event(
        db,
        waiver,
        event_type="SIGN_SUBMITTED",
        actor_user_id=None,
        source=PUBLIC_SOURCE,
        details={
            "signer_name": (signer_name or "").strip() or None,
            "relationship_to_participant": (relationship_to_participant or "").strip() or None,
        },
    )

    if participant.waiver_verified or waiver.status == STATUS_SIGNED:
        token.status = WaiverSigningToken.STATUS_COMPLETED
        token.used_at = token.used_at or now
        token.signed_at = token.signed_at or waiver.signed_at or participant.waiver_signed_at or now
        return token.signed_at

    participant.waiver_signed = True
    participant.waiver_verified = True
    participant.waiver_signed_at = now

    waiver.source = "digital"
    waiver.verified_at = now
    waiver.signed_at = now
    waiver.verified_by_user_id = None
    waiver.waiver_version = (waiver_version or "").strip() or waiver.waiver_version

    active_template_snapshot = get_active_template_snapshot(db)
    if active_template_snapshot and not waiver.waiver_version:
        waiver.waiver_version = f"v{active_template_snapshot.template_version}"

    details = waiver.version_metadata or {}
    details = dict(details)

    if active_template_snapshot:
        details["waiver_template_id"] = str(active_template_snapshot.template_id)
        details["template_version"] = int(active_template_snapshot.template_version)
        details["template_content_sha256"] = active_template_snapshot.template_content_sha256

    if signer_name:
        details["public_signer_name"] = signer_name.strip()
        if relationship_to_participant:
            details["public_signer_relationship"] = relationship_to_participant.strip()
    waiver.version_metadata = details

    transition_waiver_status(
        db,
        waiver,
        to_status=STATUS_SIGNED,
        actor_user_id=None,
        source=PUBLIC_SOURCE,
        event_type="SIGN_COMPLETED",
        details={
            "signed_at": now.isoformat(),
            "waiver_version": waiver.waiver_version,
        },
        occurred_at=now,
    )

    token.status = WaiverSigningToken.STATUS_COMPLETED
    token.used_at = now
    token.signed_at = now

    return now
