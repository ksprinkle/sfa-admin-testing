"""Phase 3C Slice B13a - PersonRelationship creation (Relationship Lifecycle).

Deliberately narrow: this module only creates relationships, immediately
verified. Per the approved B13a scope, it does not resolve, expose, or
enforce anything - api/services/capability_resolution.py's
_resolve_relationship_capabilities() remains exactly as inert as it was
before this slice, still returning an empty set unconditionally.
Relationships created here are managed, verified data with zero effect
on participant visibility or authorization until a later slice (B13b
onward) activates that resolution layer. Mirrors api/services/
person_role_management.py's shape (Slice B11) for the same domain
this project already established: write operations for an identity
table live in their own small service, separate from resolution.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from api.models.person_relationship import PersonRelationship


def create_person_relationship(
    db: Session,
    *,
    subject_person_id: UUID,
    related_person_id: UUID,
    relationship_type: str,
    can_register_for: bool = False,
    can_view_documents: bool = False,
    can_manage_documents: bool = False,
    can_receive_communications: bool = False,
    is_emergency_contact_only: bool = False,
    verified_by_user_id: str,
) -> PersonRelationship:
    """
    Creates a relationship as immediately active and verified - the
    creating admin is the verifier, the same trust model this project
    already extends to every other admin-performed identity action
    (e.g. Slice B11's role grants). No pending/approval state exists in
    this schema, and none is introduced here.
    """
    relationship = PersonRelationship(
        subject_person_id=subject_person_id,
        related_person_id=related_person_id,
        relationship_type=relationship_type,
        can_register_for=can_register_for,
        can_view_documents=can_view_documents,
        can_manage_documents=can_manage_documents,
        can_receive_communications=can_receive_communications,
        is_emergency_contact_only=is_emergency_contact_only,
        status=PersonRelationship.STATUS_ACTIVE,
        verified_at=datetime.utcnow(),
        verified_by_user_id=verified_by_user_id,
    )
    db.add(relationship)
    return relationship
