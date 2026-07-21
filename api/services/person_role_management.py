"""Phase 3C Slice B11 - PersonRole grant/revoke write operations.

Deliberately separate from api/services/capability_resolution.py (B5),
whose own stated mission is centralized *resolution*, not mutation, and
from api/services/authorization.py, which is a pure permission-mapping
module with no database writes. This module is the one place PersonRole
rows are created or changed by application code (as opposed to the
one-time Alembic backfills in B3/B7/B11's own reconciliation migration).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from api.models.person import Person
from api.models.person_role import PersonRole


def grant_person_role(
    db: Session, *, person: Person, role_code: str, granted_by_user_id: str | None = None
) -> PersonRole:
    """Idempotent grant: get-or-reactivate rather than a blind insert.

    (person_id, role_code) is uniquely constrained (api/models/
    person_role.py), so granting the same role twice - a retried
    request, or an admin re-selecting a user's current role - must not
    raise an integrity error. Safe to call repeatedly for the same
    grant; a no-op if it's already active.
    """
    existing = (
        db.query(PersonRole)
        .filter(PersonRole.person_id == person.id, PersonRole.role_code == role_code)
        .first()
    )
    if existing is not None:
        if existing.status != PersonRole.STATUS_ACTIVE:
            existing.status = PersonRole.STATUS_ACTIVE
            existing.granted_by_user_id = granted_by_user_id
        return existing

    grant = PersonRole(
        person_id=person.id,
        role_code=role_code,
        status=PersonRole.STATUS_ACTIVE,
        granted_by_user_id=granted_by_user_id,
    )
    db.add(grant)
    return grant


def revoke_person_role(db: Session, *, person: Person, role_code: str) -> None:
    """No-op if no active grant exists for this (person, role_code) -
    safe to call unconditionally, including for a person who never held
    the role being revoked."""
    existing = (
        db.query(PersonRole)
        .filter(
            PersonRole.person_id == person.id,
            PersonRole.role_code == role_code,
            PersonRole.status == PersonRole.STATUS_ACTIVE,
        )
        .first()
    )
    if existing is not None:
        existing.status = PersonRole.STATUS_REVOKED
