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

from api.models.users import User
from api.models.person import Person
from api.models.role import Role
from api.models.person_role import PersonRole
from api.services.authorization import (
    PERMISSION_ADMIN_ACCESS,
    PERMISSION_PARTICIPANTS_VIEW_OWN,
    has_permission,
    permissions_for_role,
)


class AuthorizationDualReadEquivalenceTests(unittest.TestCase):
    """
    Phase 3B Slice B3 - Authorization Equivalence Report.

    Proves has_permission()'s dual-read (PersonRole-first, legacy-fallback)
    reproduces the legacy User.role-only result in every case a real user
    can be in today, and behaves correctly in the two edge cases and one
    forward-compatibility case that don't exist in production yet but must
    be handled correctly before the legacy path can ever be retired.
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

    def _grant_role(self, person: Person, role_code: str) -> None:
        self.db.add(
            PersonRole(
                id=uuid.uuid4(),
                person_id=person.id,
                role_code=role_code,
                status=PersonRole.STATUS_ACTIVE,
            )
        )
        self.db.commit()

    # --- Scenario 1: admin, legacy only (no PersonRole rows exist at all) ---
    def test_admin_legacy_only_matches_dual_read(self):
        user = self._make_user("admin")
        legacy = PERMISSION_ADMIN_ACCESS in permissions_for_role(user.role)
        dual = has_permission(user, PERMISSION_ADMIN_ACCESS)
        self.assertTrue(legacy)
        self.assertEqual(legacy, dual)

        legacy_participant_perm = PERMISSION_PARTICIPANTS_VIEW_OWN in permissions_for_role(user.role)
        dual_participant_perm = has_permission(user, PERMISSION_PARTICIPANTS_VIEW_OWN)
        self.assertFalse(legacy_participant_perm)
        self.assertEqual(legacy_participant_perm, dual_participant_perm)

    # --- Scenario 2: participant, legacy only ---
    def test_participant_legacy_only_matches_dual_read(self):
        user = self._make_user("participant")
        legacy = PERMISSION_PARTICIPANTS_VIEW_OWN in permissions_for_role(user.role)
        dual = has_permission(user, PERMISSION_PARTICIPANTS_VIEW_OWN)
        self.assertTrue(legacy)
        self.assertEqual(legacy, dual)
        self.assertFalse(has_permission(user, PERMISSION_ADMIN_ACCESS))

    # --- Scenario 3: admin with a matching, backfilled PersonRole ---
    def test_admin_with_matching_person_role_matches_legacy(self):
        user = self._make_user("admin")
        person = self._attach_person(user)
        self._grant_role(person, "admin")

        legacy = PERMISSION_ADMIN_ACCESS in permissions_for_role(user.role)
        dual = has_permission(user, PERMISSION_ADMIN_ACCESS)
        self.assertTrue(legacy)
        self.assertEqual(legacy, dual)
        self.assertFalse(has_permission(user, PERMISSION_PARTICIPANTS_VIEW_OWN))

    # --- Scenario 4: participant with a matching, backfilled PersonRole ---
    def test_participant_with_matching_person_role_matches_legacy(self):
        user = self._make_user("participant")
        person = self._attach_person(user)
        self._grant_role(person, "participant")

        legacy = PERMISSION_PARTICIPANTS_VIEW_OWN in permissions_for_role(user.role)
        dual = has_permission(user, PERMISSION_PARTICIPANTS_VIEW_OWN)
        self.assertTrue(legacy)
        self.assertEqual(legacy, dual)
        self.assertFalse(has_permission(user, PERMISSION_ADMIN_ACCESS))

    # --- Edge case: a Person exists but has zero active PersonRole rows ---
    def test_person_without_any_active_person_role_falls_back_to_legacy(self):
        user = self._make_user("admin")
        self._attach_person(user)
        self.assertTrue(has_permission(user, PERMISSION_ADMIN_ACCESS))
        self.assertFalse(has_permission(user, PERMISSION_PARTICIPANTS_VIEW_OWN))

    # --- Edge case: no Person row exists for this user at all ---
    def test_user_without_any_person_falls_back_to_legacy(self):
        user = self._make_user("participant")
        self.assertTrue(has_permission(user, PERMISSION_PARTICIPANTS_VIEW_OWN))
        self.assertFalse(has_permission(user, PERMISSION_ADMIN_ACCESS))

    # --- Revoked PersonRole is not counted (only "active" rows count) ---
    def test_revoked_person_role_is_ignored_falls_back_to_legacy(self):
        user = self._make_user("admin")
        person = self._attach_person(user)
        self.db.add(
            PersonRole(
                id=uuid.uuid4(),
                person_id=person.id,
                role_code="admin",
                status=PersonRole.STATUS_REVOKED,
            )
        )
        self.db.commit()
        # No *active* PersonRole exists -> falls back to legacy User.role.
        self.assertTrue(has_permission(user, PERMISSION_ADMIN_ACCESS))

    # --- Forward compatibility: PersonRole succeeds even against a
    # deliberately mismatched/absent legacy value - this is the specific
    # proof that the new path is viable independent of User.role, which
    # must hold before the legacy path can ever be retired. ---
    def test_forward_compatibility_person_role_wins_over_mismatched_legacy(self):
        user = self._make_user("participant")  # legacy says participant
        person = self._attach_person(user)
        self._grant_role(person, "admin")  # PersonRole says admin

        self.assertTrue(has_permission(user, PERMISSION_ADMIN_ACCESS))
        self.assertFalse(has_permission(user, PERMISSION_PARTICIPANTS_VIEW_OWN))
        # Legacy alone would have said the opposite - proving the dual-read
        # genuinely consults PersonRole first, not just agreeing by
        # coincidence in every prior test.
        self.assertFalse(PERMISSION_ADMIN_ACCESS in permissions_for_role(user.role))


if __name__ == "__main__":
    unittest.main()
