from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session

from api.models.user_action_tokens import UserActionToken
from api.models.users import User
from api.services.email_delivery import EmailRequest, get_email_provider
from api.services.participant_claiming import ClaimResult, claim_participants_for_user

VERIFICATION_EXPIRES_IN_MINUTES = 24 * 60

EMAIL_SUBJECT = "Verify your Surfers For Autism account email"
EMAIL_TEXT_TEMPLATE = (
    "Hello,\n\n"
    "Please verify your email address using the verification token below:\n\n"
    "{token}\n\n"
    "This token expires at {expires_at} (UTC).\n\n"
    "If you did not create this account, you can ignore this email.\n"
)


def _utcnow() -> datetime:
    return datetime.utcnow()


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _generate_secure_token() -> str:
    return secrets.token_urlsafe(32)


def _new_expiration(expires_in_minutes: int) -> datetime:
    return _utcnow() + timedelta(minutes=expires_in_minutes)


def _invalidate_active_tokens(db: Session, user: User, *, purpose: str) -> int:
    now = _utcnow()
    active_tokens = (
        db.query(UserActionToken)
        .filter(
            UserActionToken.user_id == user.id,
            UserActionToken.purpose == purpose,
            UserActionToken.status == UserActionToken.STATUS_ACTIVE,
        )
        .all()
    )

    for token in active_tokens:
        token.status = UserActionToken.STATUS_INVALIDATED
        token.invalidated_at = now

    return len(active_tokens)


def _send_verification_email(user: User, *, raw_token: str, expires_at: datetime) -> None:
    request = EmailRequest(
        to=[user.email],
        subject=EMAIL_SUBJECT,
        text=EMAIL_TEXT_TEMPLATE.format(token=raw_token, expires_at=expires_at.isoformat()),
    )
    get_email_provider().send(request)


def create_verification_token(
    db: Session,
    *,
    user: User,
    expires_in_minutes: int = VERIFICATION_EXPIRES_IN_MINUTES,
) -> tuple[UserActionToken, str]:
    _invalidate_active_tokens(db, user, purpose=UserActionToken.PURPOSE_EMAIL_VERIFICATION)

    token_value = ""
    token_hash = ""
    for _ in range(5):
        token_value = _generate_secure_token()
        token_hash = _hash_token(token_value)
        exists = (
            db.query(UserActionToken.id)
            .filter(UserActionToken.token_hash == token_hash)
            .first()
        )
        if not exists:
            break
    else:
        raise HTTPException(status_code=500, detail="Unable to generate secure token")

    token = UserActionToken(
        user_id=user.id,
        purpose=UserActionToken.PURPOSE_EMAIL_VERIFICATION,
        token_hash=token_hash,
        status=UserActionToken.STATUS_ACTIVE,
        expires_at=_new_expiration(expires_in_minutes),
        token_metadata={"expires_in_minutes": expires_in_minutes},
    )
    db.add(token)
    db.flush()

    _send_verification_email(user, raw_token=token_value, expires_at=token.expires_at)

    return token, token_value


def verify_email_token(db: Session, *, raw_token: str) -> tuple[str, ClaimResult]:
    token_hash = _hash_token(raw_token)
    token = (
        db.query(UserActionToken)
        .filter(
            UserActionToken.token_hash == token_hash,
            UserActionToken.purpose == UserActionToken.PURPOSE_EMAIL_VERIFICATION,
        )
        .first()
    )

    if token is None:
        return "invalid", ClaimResult()

    now = _utcnow()

    if token.status == UserActionToken.STATUS_COMPLETED:
        return "already_used", ClaimResult()

    if token.status == UserActionToken.STATUS_INVALIDATED:
        return "invalid", ClaimResult()

    if token.status == UserActionToken.STATUS_EXPIRED or token.expires_at <= now:
        if token.status != UserActionToken.STATUS_EXPIRED:
            token.status = UserActionToken.STATUS_EXPIRED
            token.invalidated_at = now
        return "expired", ClaimResult()

    user = db.query(User).filter(User.id == token.user_id).first()
    if user is None:
        return "invalid", ClaimResult()

    user.email_verified_at = user.email_verified_at or now

    token.status = UserActionToken.STATUS_COMPLETED
    token.used_at = now

    claim_result = claim_participants_for_user(db, user)

    return "verified", claim_result
