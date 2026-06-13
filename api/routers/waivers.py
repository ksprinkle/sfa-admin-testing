from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession, joinedload

from api.db.session import get_db
from api.dependencies import require_admin
from api.models.participants import Participant
from api.models.participant_waivers import ParticipantWaiver
from api.schemas.waivers import (
    WaiverCreateTokenIn,
    WaiverCreateTokenOut,
    WaiverPublicSignIn,
    WaiverPublicSignOut,
    WaiverPublicViewOut,
)
from api.services.waiver_lifecycle import record_waiver_audit_event
from api.services.waiver_signing import (
    complete_public_signing,
    create_signing_token,
    get_token_context,
    mark_token_viewed,
    validate_token_for_access,
)

router = APIRouter(prefix="/waivers", tags=["Waivers"])


@router.post("/create-token", response_model=WaiverCreateTokenOut)
def create_waiver_signing_token(
    payload: WaiverCreateTokenIn,
    db: DBSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    participant = (
        db.query(Participant)
        .options(joinedload(Participant.waiver))
        .filter(
            Participant.id == payload.participant_id,
            Participant.removed_at.is_(None),
        )
        .first()
    )
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found")

    token_record, raw_token = create_signing_token(
        db,
        participant=participant,
        expires_in_minutes=payload.expires_in_minutes,
        actor_user_id=str(getattr(current_user, "id", "") or "") or None,
        waiver_version=payload.waiver_version,
        note=payload.note,
    )

    db.commit()

    return {
        "token": raw_token,
        "signing_path": f"/api/waivers/sign/{raw_token}",
        "expires_at": token_record.expires_at,
        "status": token_record.status,
    }


@router.get("/sign/{token}", response_model=WaiverPublicViewOut)
def get_public_waiver_signing_page(token: str, db: DBSession = Depends(get_db)):
    token_record, waiver, participant = get_token_context(db, token)
    if token_record is None or waiver is None:
        return {
            "status": "invalid",
            "message": "This waiver link is invalid.",
            "token_valid": False,
            "already_signed": False,
            "expires_at": None,
        }

    state = validate_token_for_access(db, token=token_record, waiver=waiver, event_type="view")
    if state == "expired":
        db.commit()
        return {
            "status": "expired",
            "message": "This waiver link has expired. Please request a new waiver.",
            "token_valid": False,
            "already_signed": False,
            "expires_at": token_record.expires_at,
        }

    if state == "invalid":
        db.commit()
        return {
            "status": "invalid",
            "message": "This waiver link is invalid.",
            "token_valid": False,
            "already_signed": False,
            "expires_at": None,
        }

    if state == "completed" or (participant is not None and participant.waiver_verified):
        db.commit()
        return {
            "status": "signed",
            "message": "Waiver already signed.",
            "token_valid": True,
            "already_signed": True,
            "expires_at": token_record.expires_at,
        }

    mark_token_viewed(db, token=token_record, waiver=waiver)
    db.commit()

    return {
        "status": "ready",
        "message": "Waiver link validated.",
        "token_valid": True,
        "already_signed": False,
        "expires_at": token_record.expires_at,
    }


@router.post("/sign/{token}", response_model=WaiverPublicSignOut)
def submit_public_waiver_signature(
    token: str,
    payload: WaiverPublicSignIn,
    db: DBSession = Depends(get_db),
):
    token_record, waiver, participant = get_token_context(db, token)
    if token_record is None or waiver is None or participant is None:
        return {
            "status": "invalid",
            "message": "This waiver link is invalid.",
            "already_signed": False,
            "signed_at": None,
        }

    state = validate_token_for_access(db, token=token_record, waiver=waiver, event_type="submit")
    was_already_signed = state == "completed" or bool(participant.waiver_verified)
    if state == "expired":
        db.commit()
        return {
            "status": "expired",
            "message": "This waiver link has expired. Please request a new waiver.",
            "already_signed": False,
            "signed_at": None,
        }

    if state == "invalid":
        db.commit()
        return {
            "status": "invalid",
            "message": "This waiver link is invalid.",
            "already_signed": False,
            "signed_at": None,
        }

    if not payload.accepted:
        record_waiver_audit_event(
            db,
            waiver,
            event_type="INVALID_ACCESS",
            actor_user_id=None,
            source="public_signing_link",
            details={"reason": "consent_not_accepted"},
            to_status=waiver.status,
        )
        db.commit()
        raise HTTPException(status_code=400, detail="Waiver acceptance is required")

    signed_at = complete_public_signing(
        db,
        token=token_record,
        waiver=waiver,
        participant=participant,
        signer_name=payload.signer_name,
        relationship_to_participant=payload.relationship_to_participant,
        waiver_version=payload.waiver_version,
    )
    db.commit()

    if was_already_signed:
        return {
            "status": "signed",
            "message": "Waiver already signed.",
            "already_signed": True,
            "signed_at": signed_at,
        }

    return {
        "status": "signed",
        "message": "Waiver signed successfully.",
        "already_signed": False,
        "signed_at": signed_at,
    }
