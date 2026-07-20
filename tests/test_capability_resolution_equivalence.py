from __future__ import annotations

import unittest
import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.db.base import Base
import api.models.users  # noqa: F401
import api.models.person  # noqa: F401
import api.models.role  # noqa: F401
import api.models.person_role  # noqa: F401
import api.models.household  # noqa: F401
import api.models.person_relationship  # noqa: F401

from api.models.users import User
from api.models.person import Person
from api.models.role import Role
from api.models.person_role import PersonRole
from api.services.authorization import (
    PERMISSION_ADMIN_ACCESS,
    PERMISSION_PARTICIPANTS_VIEW_OWN,
    PERMISSION_WAIVERS_VIEW_OWN,
    has_permission,
    permissions_for_role,
)
from api.services.capability_resolution import has_capability


class CapabilityResolutionEquivalenceTests(unittest.TestCase):
    """
    Phase 3B Slice B5 - Capability Resolution Equivalence Report.

    Proves capability_resolution.py's has_capability() reproduces exactly
    the same authorization decision as the existing, still-authoritative
    authorization.py::has_permission() - across every scenario a real
    user can be in today, plus the edge and forward-compatibility cases
    already established for B3. Nothing in the application calls
    capability_resolution yet; this is proof the engine COULD replace
    has_permission() faithfully, not evidence that it has - final
    authorization in production is still, and only, has_permission().
    """

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            future=True,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()

        self.db.add(Role(id=uuid.uuid4(), code="participant", display_name="Participant"))
        self.db.add(Role(id=uuid.uuid4(), code="admin", display_name="Admin"))
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()

    def _make_user(self, role: str) -> User:
        user = User(
            id=str(uuid.uuid4()),
            email=f"{uuid.uuid4()}@example.com",
            hashed_password="x",
            role=role,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def _attach_person(self, user: User) -> Person:
        person = Person(id=uuid.uuid4(), user_id=user.id, email=user.email)
        self.db.add(person)
        self.db.commit()
        self.db.refresh(person)
        return person

    def _grant_role(self, person: Person, role_code: str, *, status: str = PersonRole.STATUS_ACTIVE) -> None:
        self.db.add(
            PersonRole(id=uuid.uuid4(), person_id=person.id, role_code=role_code, status=status)
        )
        self.db.commit()

    def _assert_equivalent(self, user: User, permission: str) -> bool:
        """Runs legacy authorization and the capability engine, asserts
        they agree, and returns the shared (final) result - this is the
        Legacy / Capability Engine / Final columns of the equivalence
        report collapsed into one assertion per scenario."""
        legacy = has_permission(user, permission)
        engine = has_capability(self.db, user=user, permission=permission)
        self.assertEqual(
            legacy,
            engine,
            f"legacy={legacy} vs capability_engine={engine} for permission={permission}",
        )
        return legacy  # final authorization == legacy == engine, by the assertion above

    # --- Scenario 1: admin, legacy only (no PersonRole rows exist at all) ---
    def test_admin_legacy_only(self):
        user = self._make_user("admin")
        self.assertTrue(self._assert_equivalent(user, PERMISSION_ADMIN_ACCESS))
        self.assertFalse(self._assert_equivalent(user, PERMISSION_PARTICIPANTS_VIEW_OWN))

    # --- Scenario 2: participant, legacy only ---
    def test_participant_legacy_only(self):
        user = self._make_user("participant")
        self.assertTrue(self._assert_equivalent(user, PERMISSION_PARTICIPANTS_VIEW_OWN))
        self.assertFalse(self._assert_equivalent(user, PERMISSION_ADMIN_ACCESS))

    # --- Scenario 3: admin with a matching, backfilled PersonRole ---
    def test_admin_with_matching_person_role(self):
        user = self._make_user("admin")
        person = self._attach_person(user)
        self._grant_role(person, "admin")
        self.assertTrue(self._assert_equivalent(user, PERMISSION_ADMIN_ACCESS))
        self.assertFalse(self._assert_equivalent(user, PERMISSION_PARTICIPANTS_VIEW_OWN))

    # --- Scenario 4: participant with a matching, backfilled PersonRole ---
    def test_participant_with_matching_person_role(self):
        user = self._make_user("participant")
        person = self._attach_person(user)
        self._grant_role(person, "participant")
        self.assertTrue(self._assert_equivalent(user, PERMISSION_PARTICIPANTS_VIEW_OWN))
        self.assertFalse(self._assert_equivalent(user, PERMISSION_ADMIN_ACCESS))

    # --- Edge case: a Person exists but has zero active PersonRole rows ---
    def test_person_without_active_person_role_falls_back(self):
        user = self._make_user("admin")
        self._attach_person(user)
        self.assertTrue(self._assert_equivalent(user, PERMISSION_ADMIN_ACCESS))

    # --- Edge case: no Person row exists for this user at all ---
    def test_user_without_person_falls_back(self):
        user = self._make_user("participant")
        self.assertTrue(self._assert_equivalent(user, PERMISSION_PARTICIPANTS_VIEW_OWN))
        self.assertFalse(self._assert_equivalent(user, PERMISSION_ADMIN_ACCESS))

    # --- Revoked PersonRole is not counted by either path ---
    def test_revoked_person_role_ignored_by_both(self):
        user = self._make_user("admin")
        person = self._attach_person(user)
        self._grant_role(person, "admin", status=PersonRole.STATUS_REVOKED)
        self.assertTrue(self._assert_equivalent(user, PERMISSION_ADMIN_ACCESS))  # legacy fallback, both agree

    # --- Forward compatibility: PersonRole wins over mismatched legacy,
    # identically in both engines. ---
    def test_forward_compatibility_matches_between_engines(self):
        user = self._make_user("participant")  # legacy says participant
        person = self._attach_person(user)
        self._grant_role(person, "admin")  # PersonRole says admin

        self.assertTrue(self._assert_equivalent(user, PERMISSION_ADMIN_ACCESS))
        self.assertFalse(self._assert_equivalent(user, PERMISSION_PARTICIPANTS_VIEW_OWN))

    # --- Relationship scaffolding contributes nothing today, by design ---
    def test_relationship_scaffolding_grants_nothing_yet(self):
        actor = self._make_user("participant")
        actor_person = self._attach_person(actor)
        target = self._make_user("participant")
        target_person = self._attach_person(target)

        from api.models.person_relationship import PersonRelationship

        # Even with an active relationship row present, resolve_capabilities()
        # must not grant anything from it yet - relationship-based
        # authorization is out of scope for this slice.
        self.db.add(
            PersonRelationship(
                id=uuid.uuid4(),
                subject_person_id=actor_person.id,
                related_person_id=target_person.id,
                relationship_type="parent",
                can_register_for=True,
                can_view_documents=True,
                can_manage_documents=True,
                can_receive_communications=True,
                is_emergency_contact_only=False,
            )
        )
        self.db.commit()

        from api.services.capability_resolution import resolve_capabilities

        capabilities = resolve_capabilities(self.db, user=actor, target_person_id=target_person.id)
        self.assertNotIn(PERMISSION_ADMIN_ACCESS, capabilities)
        # Only actor's own role-based permissions should appear (both of
        # what "participant" grants) - nothing relationship-derived,
        # despite the active, fully-permissive relationship row above.
        self.assertEqual(capabilities, permissions_for_role("participant"))
        self.assertIn(PERMISSION_PARTICIPANTS_VIEW_OWN, capabilities)
        self.assertIn(PERMISSION_WAIVERS_VIEW_OWN, capabilities)


if __name__ == "__main__":
    unittest.main()
