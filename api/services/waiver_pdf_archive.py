from __future__ import annotations

from datetime import datetime
import hashlib
from io import BytesIO
from pathlib import Path
import uuid

from fastapi import HTTPException
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session, joinedload

from api.models.participant_waivers import ParticipantWaiver
from api.models.waiver_pdf_artifacts import WaiverPdfArtifact
from api.services.waiver_lifecycle import STATUS_SIGNED, record_waiver_audit_event

_STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage" / "waiver_pdfs"


def _utcnow() -> datetime:
    return datetime.utcnow()


def _safe_text(value: object) -> str:
    text = "" if value is None else str(value)
    return text.strip() or "-"


def _render_waiver_pdf_bytes(waiver: ParticipantWaiver) -> bytes:
    participant = waiver.participant
    if participant is None:
        raise HTTPException(status_code=404, detail="Waiver participant context not found")

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER

    y = height - 52
    pdf.setTitle(f"SFA Waiver {waiver.id}")

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(48, y, "Surfers For Autism - Signed Waiver Archive")
    y -= 28

    pdf.setFont("Helvetica", 11)
    lines = [
        ("Waiver ID", waiver.id),
        ("Participant ID", participant.id),
        ("Participant Name", f"{participant.first_name} {participant.last_name}"),
        ("Participant Email", participant.email),
        ("Waiver Status", waiver.status),
        ("Waiver Version", waiver.waiver_version or "unspecified"),
        ("Waiver Revision", waiver.current_revision),
        ("Waiver Source", waiver.source),
        ("Signed At", waiver.signed_at.isoformat() if waiver.signed_at else "unknown"),
        ("Verified At", waiver.verified_at.isoformat() if waiver.verified_at else "unknown"),
        ("Archived At", _utcnow().isoformat()),
    ]

    metadata = waiver.version_metadata or {}
    signer_name = metadata.get("public_signer_name") if isinstance(metadata, dict) else None
    signer_relationship = metadata.get("public_signer_relationship") if isinstance(metadata, dict) else None
    lines.extend(
        [
            ("Signer Name", signer_name or "not provided"),
            ("Signer Relationship", signer_relationship or "not provided"),
            ("Participant Waiver Verified", "true" if participant.waiver_verified else "false"),
            ("Participant Waiver Signed", "true" if participant.waiver_signed else "false"),
        ]
    )

    for label, value in lines:
        if y < 80:
            pdf.showPage()
            y = height - 52
            pdf.setFont("Helvetica", 11)
        pdf.drawString(48, y, f"{label}: {_safe_text(value)}")
        y -= 18

    y -= 8
    pdf.setFont("Helvetica-Oblique", 9)
    pdf.drawString(
        48,
        y,
        "This immutable PDF is a generated archive snapshot. Canonical waiver state remains in the database record.",
    )

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


def _ensure_signed_waiver(waiver: ParticipantWaiver) -> None:
    participant = waiver.participant
    if participant is None:
        raise HTTPException(status_code=404, detail="Waiver participant context not found")

    if waiver.status != STATUS_SIGNED or not participant.waiver_verified:
        raise HTTPException(status_code=409, detail="Waiver must be signed before PDF generation")


def _absolute_storage_path(relative_storage_path: str) -> Path:
    path = _STORAGE_ROOT / relative_storage_path
    return path.resolve()


def create_or_get_waiver_pdf_artifact(
    db: Session,
    *,
    waiver: ParticipantWaiver,
    actor_user_id: str | None,
) -> tuple[WaiverPdfArtifact, bool]:
    _ensure_signed_waiver(waiver)

    revision = max(1, int(waiver.current_revision or 1))
    existing = (
        db.query(WaiverPdfArtifact)
        .filter(
            WaiverPdfArtifact.waiver_id == waiver.id,
            WaiverPdfArtifact.waiver_revision == revision,
        )
        .first()
    )
    if existing is not None:
        return existing, False

    payload = _render_waiver_pdf_bytes(waiver)
    sha256_hash = hashlib.sha256(payload).hexdigest()
    byte_size = len(payload)

    artifact_id = uuid.uuid4()
    relative_path = f"{waiver.id}/{revision}/{artifact_id}.pdf"
    absolute_path = _absolute_storage_path(relative_path)
    absolute_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(absolute_path, "xb") as handle:
            handle.write(payload)
    except FileExistsError as exc:
        raise HTTPException(status_code=500, detail="Archive path collision while storing waiver PDF") from exc

    artifact = WaiverPdfArtifact(
        id=artifact_id,
        waiver_id=waiver.id,
        participant_id=waiver.participant_id,
        waiver_version=waiver.waiver_version,
        waiver_revision=revision,
        storage_path=relative_path,
        mime_type="application/pdf",
        sha256_hash=sha256_hash,
        byte_size=byte_size,
        is_immutable=True,
        generated_by_user_id=actor_user_id,
    )
    db.add(artifact)

    record_waiver_audit_event(
        db,
        waiver,
        event_type="PDF_GENERATED",
        actor_user_id=actor_user_id,
        source="waiver_pdf_archive",
        details={
            "artifact_id": str(artifact.id),
            "waiver_revision": revision,
        },
    )
    record_waiver_audit_event(
        db,
        waiver,
        event_type="PDF_STORED",
        actor_user_id=actor_user_id,
        source="waiver_pdf_archive",
        details={
            "artifact_id": str(artifact.id),
            "storage_path": relative_path,
            "sha256_hash": sha256_hash,
            "byte_size": byte_size,
        },
    )

    return artifact, True


def get_waiver_with_context(db: Session, waiver_id) -> ParticipantWaiver:
    waiver = (
        db.query(ParticipantWaiver)
        .options(joinedload(ParticipantWaiver.participant))
        .filter(ParticipantWaiver.id == waiver_id)
        .first()
    )
    if waiver is None:
        raise HTTPException(status_code=404, detail="Waiver not found")
    return waiver


def get_latest_pdf_artifact_for_waiver(db: Session, waiver_id) -> WaiverPdfArtifact:
    artifact = (
        db.query(WaiverPdfArtifact)
        .filter(WaiverPdfArtifact.waiver_id == waiver_id)
        .order_by(WaiverPdfArtifact.waiver_revision.desc(), WaiverPdfArtifact.generated_at.desc())
        .first()
    )
    if artifact is None:
        raise HTTPException(status_code=404, detail="Waiver PDF artifact not found")
    return artifact


def resolve_artifact_file_path(artifact: WaiverPdfArtifact) -> Path:
    absolute_path = _absolute_storage_path(artifact.storage_path)
    if not absolute_path.exists() or not absolute_path.is_file():
        raise HTTPException(status_code=404, detail="Waiver PDF file not found")
    return absolute_path
