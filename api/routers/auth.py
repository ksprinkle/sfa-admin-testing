import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from api.db.session import get_db
from api.dependencies import get_current_user
from api.models.users import User
from api.security import hash_password, verify_password, create_access_token
from fastapi.security import OAuth2PasswordRequestForm
from api.schemas.users import (
    UserCreate,
    UserResponse,
    UserRoleByEmailUpdateRequest,
    VerifyEmailConfirmRequest,
    VerifyEmailResendRequest,
)
from api.dependencies import require_admin
from api.config import settings
from sqlalchemy.orm import object_session

from api.models.person import Person
from api.services.account_verification import create_verification_token, verify_email_token
from api.services.admin_audit import record_admin_audit_event
from api.services.authorization import ROLE_PARTICIPANT, is_supported_role
from api.services.capability_resolution import resolve_capabilities
from api.services.email_delivery import EmailDeliveryError
from api.services.person_role_management import grant_person_role, revoke_person_role
from api.services.rate_limiting import enforce_rate_limit
from api.utils.email_normalization import normalize_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])

#TODO: Add rate limiting for login attempts (registration is now rate limited below).
@router.post("/register")
def register(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_rate_limit("auth_register", max_requests=5, window_seconds=900)),
):
    normalized_email = normalize_email(payload.email)

    existing = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=normalized_email,
        hashed_password=hash_password(payload.password),
        role=ROLE_PARTICIPANT
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # Phase 3B Slice B7: every new account gets a correlated Person going
    # forward, mirroring exactly what Slice B1's one-time migration did
    # retroactively for pre-existing accounts.
    person = Person(email=user.email, user_id=user.id)
    db.add(person)
    db.flush()  # assigns person.id so the grant below can reference it, without ending this transaction

    # Phase 3C Slice B11: grant the initial PersonRole in the same
    # transaction as Person, not a separate commit - there is no
    # external dependency here (unlike the verification-email step
    # below), so there's no reason to allow "Person exists, PersonRole
    # doesn't" as a reachable state. From this point on, new accounts
    # resolve authorization via PersonRole immediately, never the
    # legacy User.role fallback.
    grant_person_role(db, person=person, role_code=ROLE_PARTICIPANT)
    db.commit()

    # Best-effort: account creation must not fail because the verification
    # email couldn't be sent - the account already exists and committed above.
    # An EmailDeliveryError (SMTP down, auth failure, etc.) is logged so it's
    # actually visible, rather than silently swallowed as before; the tester
    # can still request a fresh one via /verify-email/resend, which does
    # surface a real error (see below) since sending is that endpoint's only
    # job.
    try:
        create_verification_token(db, user=user)
        db.commit()
    except EmailDeliveryError as exc:
        db.rollback()
        logger.warning("Verification email failed to send during registration for user_id=%s: %s", user.id, exc)
    except Exception:
        db.rollback()

    return {"message": "User created successfully"}


@router.post("/verify-email/resend")
def resend_verification_email(
    payload: VerifyEmailResendRequest,
    db: Session = Depends(get_db),
    _rate_limit: None = Depends(enforce_rate_limit("auth_verify_email_resend", max_requests=5, window_seconds=900)),
):
    normalized_email = normalize_email(payload.email)
    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()

    if user and user.email_verified_at is None:
        try:
            create_verification_token(db, user=user)
            db.commit()
        except EmailDeliveryError as exc:
            db.rollback()
            logger.warning("Verification email resend failed for user_id=%s: %s", user.id, exc)
            raise HTTPException(status_code=502, detail="Unable to send verification email right now. Please try again shortly.")

    return {"message": "If that email exists and is not yet verified, a verification email has been sent"}


@router.post("/verify-email/confirm")
def confirm_verification_email(
    payload: VerifyEmailConfirmRequest,
    db: Session = Depends(get_db),
):
    # Token validation, email_verified_at, participant claiming, and their audit
    # events all happen inside verify_email_token() without an intermediate commit,
    # so this is one atomic transaction: any failure before the commit below rolls
    # back everything (no partially-claimed account, no partial audit trail).
    try:
        result, claim_result = verify_email_token(db, raw_token=payload.token)
    except Exception:
        db.rollback()
        raise

    if result == "verified":
        db.commit()
        return {
            "message": "Email verified successfully",
            "claimed_registrations": claim_result.count,
        }

    if result == "expired":
        db.commit()
        raise HTTPException(status_code=400, detail="Verification token has expired")

    if result == "already_used":
        raise HTTPException(status_code=400, detail="Verification token has already been used")

    raise HTTPException(status_code=400, detail="Invalid verification token")

#TODO: Implement refresh tokens and token revocation for better security.
@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({
        "sub": str(user.id),
        "role": user.role
    })

    return {
        "access_token": token,
        "token_type": "bearer"
    }

#TODO: Add endpoint for users to update their own password and email, with appropriate validation and security checks.
# Phase 3C Slice B11: these two "/admin/users/by-email/..." routes must
# be registered before "/admin/users/{user_id}/role" below. FastAPI/
# Starlette matches routes in registration order, and "/admin/users/
# by-email/role" has the exact same path shape as "/admin/users/
# {user_id}/role" (4 segments, differing only in the 3rd) - registered
# after the wildcard route, "by-email" would be captured as user_id
# and this endpoint would 404 on every real call, permanently
# unreachable. Discovered while adding this slice's own tests. Fixed
# here as part of B11 rather than deferred, since B11 already touches
# this exact endpoint.
@router.put("/admin/users/by-email/role", response_model=UserResponse)
def update_user_role_by_email(
    email: str,
    new_role: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    normalized_email = email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()

    # Query-string '+' can arrive as a space if client URL-encoding is omitted.
    if not user and " " in normalized_email:
        plus_variant = normalized_email.replace(" ", "+")
        user = db.query(User).filter(func.lower(User.email) == plus_variant).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not is_supported_role(new_role):
        raise HTTPException(status_code=400, detail="Invalid role")

    previous_role = user.role
    user.role = new_role

    # Phase 3C Slice B11: keep PersonRole synchronized - see the
    # matching comment in update_user_role() below.
    person = db.query(Person).filter(Person.user_id == user.id).first()
    if person is not None:
        revoke_person_role(db, person=person, role_code=previous_role)
        grant_person_role(db, person=person, role_code=new_role, granted_by_user_id=current_user.id)

    record_admin_audit_event(
        db,
        domain="permissions",
        action="user_role_updated",
        actor_user_id=current_user.id,
        target_type="user",
        target_id=user.id,
        target_display=user.email,
        source="auth.admin.users.by_email.role",
        details={
            "previous_role": previous_role,
            "new_role": new_role,
            "lookup_email": normalized_email,
        },
    )
    db.commit()
    db.refresh(user)

    return user


@router.put("/admin/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: str,
    new_role: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not is_supported_role(new_role):
        raise HTTPException(status_code=400, detail="Invalid role")

    previous_role = user.role
    user.role = new_role

    # Phase 3C Slice B11: keep PersonRole synchronized with the legacy
    # field this endpoint has always written, in the same transaction -
    # closes the divergence KNOWN_TECHNICAL_DEBT.md flagged (changing a
    # role here previously had no effect on an account whose PersonRole
    # already existed, since PersonRole-first resolution took
    # precedence over the legacy field being updated here).
    person = db.query(Person).filter(Person.user_id == user.id).first()
    if person is not None:
        revoke_person_role(db, person=person, role_code=previous_role)
        grant_person_role(db, person=person, role_code=new_role, granted_by_user_id=current_user.id)

    record_admin_audit_event(
        db,
        domain="permissions",
        action="user_role_updated",
        actor_user_id=current_user.id,
        target_type="user",
        target_id=user.id,
        target_display=user.email,
        source="auth.admin.users.role",
        details={
            "previous_role": previous_role,
            "new_role": new_role,
        },
    )
    db.commit()
    db.refresh(user)

    return user


@router.get("/admin/users", response_model=list[UserResponse])
def list_users(
    email_contains: Optional[str] = None,
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    query = db.query(User)

    if email_contains:
        query = query.filter(User.email.ilike(f"%{email_contains}%"))

    if role:
        if role not in ["admin", "participant"]:
            raise HTTPException(status_code=400, detail="Invalid role")
        query = query.filter(User.role == role)

    return query.order_by(User.email.asc()).all()


@router.put("/admin/users/by-email/role-body", response_model=UserResponse)
def update_user_role_by_email_body(
    payload: UserRoleByEmailUpdateRequest,
    db: Session = Depends(get_db),
    current_user = Depends(require_admin),
):
    normalized_email = payload.email.strip().lower()
    new_role = payload.new_role.strip().lower()

    user = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not is_supported_role(new_role):
        raise HTTPException(status_code=400, detail="Invalid role")

    previous_role = user.role
    user.role = new_role

    # Phase 3C Slice B11: keep PersonRole synchronized - see the
    # matching comment in update_user_role() above.
    person = db.query(Person).filter(Person.user_id == user.id).first()
    if person is not None:
        revoke_person_role(db, person=person, role_code=previous_role)
        grant_person_role(db, person=person, role_code=new_role, granted_by_user_id=current_user.id)

    record_admin_audit_event(
        db,
        domain="permissions",
        action="user_role_updated",
        actor_user_id=current_user.id,
        target_type="user",
        target_id=user.id,
        target_display=user.email,
        source="auth.admin.users.by_email.role_body",
        details={
            "previous_role": previous_role,
            "new_role": new_role,
            "lookup_email": normalized_email,
        },
    )
    db.commit()
    db.refresh(user)

    return user

def _resolve_capabilities_for_response(user: User) -> list[str] | None:
    """
    Phase 3B Slice B8 - derived runtime state only, never cached or
    persisted (see PHASE3B_SLICE_B8_ARCHITECTURE_REVIEW.md): resolve
    user -> resolve person -> resolve roles -> resolve capabilities ->
    serialize response, recomputed fresh on every call via the Slice B5
    engine. GET /auth/me is depended on by both the admin shell and the
    participant portal to establish a session at all, so a failure here
    must never turn into a 500 on this endpoint - logs and degrades to
    None instead of raising.
    """
    try:
        session = object_session(user)
        if session is None:
            return None
        return sorted(resolve_capabilities(session, user=user))
    except Exception:
        logger.warning(
            "capability_engine_expose_error user_id=%s", getattr(user, "id", None), exc_info=True
        )
        return None


#TODO: Implement an endpoint for users to view and update their own profile information, with appropriate authentication and validation.
@router.get("/me", response_model=UserResponse)
def get_me(current_user = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        email_verified_at=current_user.email_verified_at,
        capabilities=_resolve_capabilities_for_response(current_user),
    )

#TODO: Add endpoint for users to update their own password and email, with appropriate validation and security checks.
# DEV endpoint is available only in non-production debug runs.
if settings.DEV_ROUTES_ENABLED:
    @router.post("/dev/promote-me")
    def promote_me(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
    ):
        current_user.role = "admin"
        db.commit()
        db.refresh(current_user)
        return current_user 
