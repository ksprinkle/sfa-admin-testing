"""Phase 3B Slice B5 - Capability Resolution Engine.

The canonical, centralized engine this identity migration is building
toward: eventually, everything should ask this module "Can Person X
perform Capability Y on Resource Z?" instead of checking `User.role ==
"admin"` directly. Layering, per PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_
ARCHITECTURE_REVIEW.md and the PHASE3B roadmap's §0.1 refinement:

    Person -> Roles -> Relationships -> Capabilities -> Authorization

This slice's mission is narrow on purpose: centralize capability
evaluation without changing any authorization decision. Nothing in the
application calls this module yet - api/services/authorization.py::
has_permission() is unmodified and remains the sole enforcement path
until a later slice begins consulting this one. The bar this module is
held to: if it were removed tomorrow, nothing would break, because
nothing depends on it yet; if it were substituted in tomorrow instead,
nothing should change, because it's built to reproduce today's result
exactly (proven in tests/test_capability_resolution_equivalence.py).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy.orm import Session

from api.models.person import Person
from api.models.person_relationship import PersonRelationship
from api.models.person_role import PersonRole
from api.models.users import User
from api.services.authorization import permissions_for_role


@dataclass(frozen=True)
class CapabilityContext:
    """What resolve_capabilities() found while resolving, for observability
    and testing - not consumed by any caller yet."""

    actor_person: Person | None
    role_codes: tuple[str, ...] = ()
    used_legacy_fallback: bool = False


def resolve_person_for_user(db: Session, user: User) -> Person | None:
    """Person layer: the durable identity correlated to this credential,
    if one exists yet (see Slice B1)."""
    return db.query(Person).filter(Person.user_id == user.id).first()


def _resolve_role_based_permissions(db: Session, user: User) -> tuple[set[str], CapabilityContext]:
    """Roles layer. Deliberately mirrors api/services/authorization.py::
    has_permission()'s dual-read exactly (active PersonRole grants first,
    falling back to legacy User.role only when none exist) - this is the
    part that must be provably identical to today's result, since
    role-based access is the only thing currently granted in production.
    """
    person = resolve_person_for_user(db, user)

    if person is not None:
        active_roles = (
            db.query(PersonRole)
            .filter(PersonRole.person_id == person.id, PersonRole.status == PersonRole.STATUS_ACTIVE)
            .all()
        )
        if active_roles:
            role_codes = tuple(row.role_code for row in active_roles)
            granted: set[str] = set()
            for role_code in role_codes:
                granted |= permissions_for_role(role_code)
            return granted, CapabilityContext(actor_person=person, role_codes=role_codes)

    # Legacy fallback - identical semantics to has_permission()'s fallback.
    return permissions_for_role(user.role), CapabilityContext(actor_person=person, used_legacy_fallback=True)


def _resolve_relationship_capabilities(
    db: Session, *, actor_person: Person | None, target_person_id: UUID | None
) -> set[str]:
    """Relationships -> Capabilities layer (scaffolding only, Slice B5).

    Looks up any active PersonRelationship from `actor_person` to the
    given target and would translate its capability flags
    (can_register_for, can_view_documents, etc.) into permission
    strings - but no such rows exist in production yet (Slice B4
    introduced the table with zero backfill or inference, deliberately),
    and this function is not part of resolve_capabilities()'s default
    path for anything callable today. It exists so a later slice has a
    real interface and a real query to build the actual flag-to-
    permission mapping against, rather than inventing one under time
    pressure once relationship data starts existing. Returns an empty
    set unconditionally - deciding which flag maps to which permission
    string is an explicit, later slice's job, not this one's.
    """
    if actor_person is None or target_person_id is None:
        return set()

    active_relationships = (
        db.query(PersonRelationship)
        .filter(
            PersonRelationship.subject_person_id == actor_person.id,
            PersonRelationship.related_person_id == target_person_id,
            PersonRelationship.status == PersonRelationship.STATUS_ACTIVE,
        )
        .all()
    )
    # Deliberately unused beyond confirming the query itself is valid -
    # see docstring. Enabling relationship-based capabilities is out of
    # scope for this slice.
    del active_relationships
    return set()


def resolve_household_ids_for_person(db: Session, person: Person | None) -> set[UUID]:
    """Household scaffolding (Slice B5) - would eventually answer "which
    household(s) is this person a member of," derived from
    PersonRelationship.household_id. Not consulted by resolve_capabilities()
    yet; exists as a documented extension point for a future slice that
    needs household-scoped logic (e.g. "can this person manage this
    household's membership").
    """
    if person is None:
        return set()

    rows = (
        db.query(PersonRelationship.household_id)
        .filter(
            PersonRelationship.subject_person_id == person.id,
            PersonRelationship.household_id.isnot(None),
            PersonRelationship.status == PersonRelationship.STATUS_ACTIVE,
        )
        .all()
    )
    return {row[0] for row in rows}


def resolve_capabilities(db: Session, *, user: User, target_person_id: UUID | None = None) -> set[str]:
    """The canonical entry point a future slice should call instead of
    api/services/authorization.py::has_permission() - not called from
    anywhere in the application yet. Combines the Roles layer (real,
    provably equivalent to today's dual-read - see the equivalence
    report) with the Relationships layer (scaffolded, contributes
    nothing today) into the resulting permission-string set.
    """
    granted, context = _resolve_role_based_permissions(db, user)
    granted |= _resolve_relationship_capabilities(
        db, actor_person=context.actor_person, target_person_id=target_person_id
    )
    return granted


def has_capability(
    db: Session, *, user: User, permission: str, target_person_id: UUID | None = None
) -> bool:
    """Convenience boolean form, mirroring has_permission()'s shape -
    not called from anywhere in the application yet."""
    requested = permission.strip().lower()
    return requested in resolve_capabilities(db, user=user, target_person_id=target_person_id)
