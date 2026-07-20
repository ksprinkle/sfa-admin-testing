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
from api.models.person import Person
from api.services.account_verification import create_verification_token, verify_email_token
from api.services.admin_audit import record_admin_audit_event
from api.services.authorization import ROLE_PARTICIPANT, is_supported_role
from api.services.email_delivery import EmailDeliveryError
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
    # retroactively for pre-existing accounts. Not yet read by any
    # authorization or ownership decision outside api/services/
    # participant_claiming.py and public_registration.py's own person_id
    # bookkeeping - user_id remains fully authoritative everywhere else.
    person = Person(email=user.email, user_id=user.id)
    db.add(person)
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

#TODO: Implement an endpoint for users to view and update their own profile information, with appropriate authentication and validation.
@router.get("/me", response_model=UserResponse)
def get_me(current_user = Depends(get_current_user)):
    return current_user

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
