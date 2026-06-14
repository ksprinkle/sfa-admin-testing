from datetime import datetime
from uuid import UUID
import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession, joinedload

from api.db.session import get_db
from api.dependencies import require_admin
from api.models.participants import Participant
from api.schemas.waivers import (
    WaiverCreateTokenIn,
    WaiverCreateTokenOut,
    WaiverDashboardMetricsOut,
    WaiverDeliveryCreateIn,
    WaiverDeliveryOut,
    WaiverDeliveryResendIn,
    WaiverAnalyticsEventOut,
    WaiverPdfArtifactOut,
    WaiverPdfVerificationOut,
    WaiverPublicSignIn,
    WaiverPublicSignOut,
    WaiverPublicViewOut,
)
from api.services.waiver_delivery import (
    create_delivery_attempt,
    get_delivery_for_waiver,
    get_waiver_for_delivery,
    list_deliveries_for_waiver,
)
from api.services.waiver_lifecycle import record_waiver_audit_event
from api.services.waiver_pdf_archive import (
    create_or_get_waiver_pdf_artifact,
    get_latest_pdf_artifact_for_waiver,
    get_waiver_with_context,
    resolve_artifact_file_path,
    verify_artifact_for_waiver,
)
from api.services.waiver_reporting import (
    get_analytics_event_rows,
    get_dashboard_metrics,
    get_delivery_rows_for_export,
)
from api.services.waiver_signing import (
    complete_public_signing,
    create_signing_token,
    get_token_context,
    mark_token_viewed,
    validate_token_for_access,
)

router = APIRouter(prefix="/waivers", tags=["Waivers"])


@router.get("/reports/metrics", response_model=WaiverDashboardMetricsOut)
def get_waiver_dashboard_metrics(
    event_id: UUID | None = None,
    db: DBSession = Depends(get_db),
    _current_user=Depends(require_admin),
):
    metrics = get_dashboard_metrics(db, event_id=event_id)
    return {
        "event_id": event_id,
        "total_participants": metrics.total_participants,
        "waivers_required": metrics.waivers_required,
        "waivers_sent": metrics.waivers_sent,
        "waivers_viewed": metrics.waivers_viewed,
        "waivers_signed": metrics.waivers_signed,
        "expired_links": metrics.expired_links,
        "email_deliveries": metrics.email_deliveries,
        "sms_deliveries": metrics.sms_deliveries,
        "failed_deliveries": metrics.failed_deliveries,
        "completion_rate": metrics.completion_rate,
    }


@router.get("/reports/analytics-events", response_model=list[WaiverAnalyticsEventOut])
def get_waiver_analytics_events(
    event_id: UUID | None = None,
    days: int = 30,
    db: DBSession = Depends(get_db),
    _current_user=Depends(require_admin),
):
    rows = get_analytics_event_rows(db, event_id=event_id, days=days)
    return [
        {
            "event_date": str(getattr(row, "event_date", "")),
            "event_type": str(getattr(row, "event_type", "")),
            "count": int(getattr(row, "count", 0) or 0),
        }
        for row in rows
    ]


@router.get("/reports/deliveries/export.csv")
def export_waiver_deliveries_csv(
    event_id: UUID | None = None,
    db: DBSession = Depends(get_db),
    _current_user=Depends(require_admin),
):
    rows = get_delivery_rows_for_export(db, event_id=event_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "delivery_id",
            "waiver_id",
            "participant_id",
            "event_id",
            "participant_first_name",
            "participant_last_name",
            "participant_email",
            "method",
            "recipient",
            "status",
            "attempt_number",
            "template_key",
            "provider_message_id",
            "error_message",
            "signing_path",
            "token_expires_at",
            "completed_at",
            "created_at",
        ]
    )

    for row in rows:
        writer.writerow(
            [
                str(row.id),
                str(row.waiver_id),
                str(row.participant_id),
                str(row.event_id),
                row.first_name,
                row.last_name,
                row.email,
                row.method,
                row.recipient,
                row.status,
                row.attempt_number,
                row.template_key,
                row.provider_message_id,
                row.error_message,
                row.signing_path,
                row.token_expires_at.isoformat() if row.token_expires_at else None,
                row.completed_at.isoformat() if row.completed_at else None,
                row.created_at.isoformat() if row.created_at else None,
            ]
        )

    csv_text = output.getvalue()
    output.close()

    suffix = f"-event-{event_id}" if event_id else ""
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=waiver-deliveries{suffix}-{timestamp}.csv"},
    )


@router.post("/{waiver_id}/deliveries", response_model=WaiverDeliveryOut)
def create_waiver_delivery(
    waiver_id: UUID,
    payload: WaiverDeliveryCreateIn,
    db: DBSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    waiver = get_waiver_for_delivery(db, waiver_id)
    actor_user_id = str(getattr(current_user, "id", "") or "") or None

    delivery = create_delivery_attempt(
        db,
        waiver=waiver,
        method=payload.method,
        recipient=payload.recipient,
        expires_in_minutes=payload.expires_in_minutes,
        template_key=payload.template_key,
        subject_template=payload.subject_template,
        body_template=payload.body_template,
        actor_user_id=actor_user_id,
    )
    db.commit()
    db.refresh(delivery)
    return delivery


@router.post("/{waiver_id}/deliveries/{delivery_id}/resend", response_model=WaiverDeliveryOut)
def resend_waiver_delivery(
    waiver_id: UUID,
    delivery_id: UUID,
    payload: WaiverDeliveryResendIn,
    db: DBSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    waiver = get_waiver_for_delivery(db, waiver_id)
    previous = get_delivery_for_waiver(db, waiver_id=waiver_id, delivery_id=delivery_id)
    actor_user_id = str(getattr(current_user, "id", "") or "") or None

    delivery = create_delivery_attempt(
        db,
        waiver=waiver,
        method=payload.method or previous.method,
        recipient=(payload.recipient or previous.recipient),
        expires_in_minutes=payload.expires_in_minutes,
        template_key=payload.template_key or previous.template_key,
        subject_template=payload.subject_template,
        body_template=payload.body_template,
        actor_user_id=actor_user_id,
        resend_of=previous,
        resend_reason=payload.resend_reason,
    )
    db.commit()
    db.refresh(delivery)
    return delivery


@router.get("/{waiver_id}/deliveries", response_model=list[WaiverDeliveryOut])
def list_waiver_deliveries(
    waiver_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user=Depends(require_admin),
):
    _ = get_waiver_for_delivery(db, waiver_id)
    return list_deliveries_for_waiver(db, waiver_id=waiver_id)


@router.get("/{waiver_id}/deliveries/{delivery_id}", response_model=WaiverDeliveryOut)
def get_waiver_delivery(
    waiver_id: UUID,
    delivery_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user=Depends(require_admin),
):
    _ = get_waiver_for_delivery(db, waiver_id)
    return get_delivery_for_waiver(db, waiver_id=waiver_id, delivery_id=delivery_id)


@router.post("/{waiver_id}/pdf/generate", response_model=WaiverPdfArtifactOut)
def generate_waiver_pdf_artifact(
    waiver_id: UUID,
    db: DBSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    waiver = get_waiver_with_context(db, waiver_id)
    actor_user_id = str(getattr(current_user, "id", "") or "") or None

    artifact, created = create_or_get_waiver_pdf_artifact(
        db,
        waiver=waiver,
        actor_user_id=actor_user_id,
    )
    db.commit()
    db.refresh(artifact)

    response = {
        "id": artifact.id,
        "waiver_id": artifact.waiver_id,
        "participant_id": artifact.participant_id,
        "waiver_version": artifact.waiver_version,
        "waiver_revision": artifact.waiver_revision,
        "waiver_template_id": artifact.waiver_template_id,
        "template_version": artifact.template_version,
        "template_content_sha256": artifact.template_content_sha256,
        "storage_path": artifact.storage_path,
        "mime_type": artifact.mime_type,
        "sha256_hash": artifact.sha256_hash,
        "byte_size": artifact.byte_size,
        "is_immutable": artifact.is_immutable,
        "generated_at": artifact.generated_at,
        "generated_by_user_id": artifact.generated_by_user_id,
        "already_exists": not created,
    }
    return response


@router.get("/{waiver_id}/pdf", response_model=WaiverPdfArtifactOut)
def get_waiver_pdf_artifact_metadata(
    waiver_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user=Depends(require_admin),
):
    artifact = get_latest_pdf_artifact_for_waiver(db, waiver_id)
    return {
        "id": artifact.id,
        "waiver_id": artifact.waiver_id,
        "participant_id": artifact.participant_id,
        "waiver_version": artifact.waiver_version,
        "waiver_revision": artifact.waiver_revision,
        "waiver_template_id": artifact.waiver_template_id,
        "template_version": artifact.template_version,
        "template_content_sha256": artifact.template_content_sha256,
        "storage_path": artifact.storage_path,
        "mime_type": artifact.mime_type,
        "sha256_hash": artifact.sha256_hash,
        "byte_size": artifact.byte_size,
        "is_immutable": artifact.is_immutable,
        "generated_at": artifact.generated_at,
        "generated_by_user_id": artifact.generated_by_user_id,
        "already_exists": True,
    }


@router.get("/{waiver_id}/pdf/download")
def download_waiver_pdf_artifact(
    waiver_id: UUID,
    db: DBSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    artifact = get_latest_pdf_artifact_for_waiver(db, waiver_id)
    file_path = resolve_artifact_file_path(artifact)

    waiver = get_waiver_with_context(db, waiver_id)
    actor_user_id = str(getattr(current_user, "id", "") or "") or None
    record_waiver_audit_event(
        db,
        waiver,
        event_type="PDF_RETRIEVED",
        actor_user_id=actor_user_id,
        source="waiver_pdf_archive",
        details={
            "artifact_id": str(artifact.id),
            "storage_path": artifact.storage_path,
        },
    )
    db.commit()

    return FileResponse(
        path=str(file_path),
        media_type=artifact.mime_type,
        filename=f"waiver-{waiver_id}-r{artifact.waiver_revision}.pdf",
    )


@router.get("/{waiver_id}/pdf/verify", response_model=WaiverPdfVerificationOut)
def verify_waiver_pdf_artifact(
    waiver_id: UUID,
    db: DBSession = Depends(get_db),
    _current_user=Depends(require_admin),
):
    return verify_artifact_for_waiver(db, waiver_id)


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
