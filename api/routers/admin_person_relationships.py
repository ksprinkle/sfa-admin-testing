from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.db.session import get_db
from api.dependencies import require_admin
from api.models.person import Person
from api.models.person_relationship import PersonRelationship
from api.schemas.person_relationships import PersonRelationshipCreate, PersonRelationshipOut
from api.services.admin_audit import record_admin_audit_event
from api.services.person_relationship_management import create_person_relationship

router = APIRouter(prefix="/admin/person-relationships", tags=["Admin Person Relationships"])


# Phase 3C Slice B13a: admin-only relationship creation, immediately
# verified. Deliberately inert with respect to participant ownership -
# see PHASE3C_SLICE_B13_RELATIONSHIP_OWNERSHIP_ARCHITECTURE_REVIEW.md.
# Nothing reads PersonRelationship for authorization/ownership purposes
# yet; this endpoint only brings verified relationship records into
# existence.
@router.post("", response_model=PersonRelationshipOut, status_code=201)
def create_relationship(
    payload: PersonRelationshipCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    if payload.subject_person_id == payload.related_person_id:
        raise HTTPException(status_code=400, detail="A person cannot have a relationship to themselves")

    subject = db.query(Person).filter(Person.id == payload.subject_person_id).first()
    if subject is None:
        raise HTTPException(status_code=404, detail="subject_person_id does not correspond to an existing Person")

    related = db.query(Person).filter(Person.id == payload.related_person_id).first()
    if related is None:
        raise HTTPException(status_code=404, detail="related_person_id does not correspond to an existing Person")

    relationship = create_person_relationship(
        db,
        subject_person_id=payload.subject_person_id,
        related_person_id=payload.related_person_id,
        relationship_type=payload.relationship_type,
        can_register_for=payload.can_register_for,
        can_view_documents=payload.can_view_documents,
        can_manage_documents=payload.can_manage_documents,
        can_receive_communications=payload.can_receive_communications,
        is_emergency_contact_only=payload.is_emergency_contact_only,
        verified_by_user_id=current_user.id,
    )
    db.flush()

    record_admin_audit_event(
        db,
        domain="relationships",
        action="person_relationship_created",
        actor_user_id=current_user.id,
        target_type="person_relationship",
        target_id=str(relationship.id),
        target_display=f"{payload.subject_person_id} -> {payload.related_person_id}",
        source="admin.person_relationships.create",
        details={
            "subject_person_id": str(payload.subject_person_id),
            "related_person_id": str(payload.related_person_id),
            "relationship_type": payload.relationship_type,
            "can_register_for": payload.can_register_for,
        },
    )

    db.commit()
    db.refresh(relationship)
    return relationship


@router.get("", response_model=list[PersonRelationshipOut])
def list_relationships(
    subject_person_id: UUID | None = None,
    related_person_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    query = db.query(PersonRelationship)
    if subject_person_id is not None:
        query = query.filter(PersonRelationship.subject_person_id == subject_person_id)
    if related_person_id is not None:
        query = query.filter(PersonRelationship.related_person_id == related_person_id)

    return query.order_by(PersonRelationship.created_at.desc()).all()
