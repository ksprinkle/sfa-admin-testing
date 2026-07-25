from __future__ import annotations

import unittest
import uuid
from datetime import datetime

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
from api.models.person_relationship import PersonRelationship
from api.services.capability_resolution import resolve_manageable_person_ids


class OwnershipResolutionTests(unittest.TestCase):
    """
    Phase 3C Slice B13b - resolve_manageable_person_ids().

    Proves the ownership resolution engine implements the B13 architecture
    review's canonical two-rule policy (direct + delegated-via-verified-
    active-can_register_for-relationship) without touching any existing
    ownership query or authorization decision - nothing calls this
    function outside these tests yet.
    """

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.SessionLocal()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _make_user(self, email: str) -> User:
        user = User(id=str(uuid.uuid4()), email=email, hashed_password="x", role="participant")
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

    def _add_relationship(
        self,
        *,
        subject_person: Person,
        related_person: Person,
        can_register_for: bool = True,
        status: str = PersonRelationship.STATUS_ACTIVE,
        verified: bool = True,
    ) -> PersonRelationship:
        relationship = PersonRelationship(
            id=uuid.uuid4(),
            subject_person_id=subject_person.id,
            related_person_id=related_person.id,
            relationship_type="parent",
            can_register_for=can_register_for,
            status=status,
            verified_at=datetime.utcnow() if verified else None,
            verified_by_user_id=None,
        )
        self.db.add(relationship)
        self.db.commit()
        return relationship

    # --- Direct ownership ---
    def test_direct_ownership_only(self) -> None:
        user = self._make_user("solo@example.com")
        person = self._attach_person(user)

        result = resolve_manageable_person_ids(self.db, user)

        self.assertEqual(result, {person.id})

    # --- Verified relationship expansion ---
    def test_verified_active_relationship_expands_manageable_set(self) -> None:
        guardian_user = self._make_user("guardian@example.com")
        guardian_person = self._attach_person(guardian_user)
        child_user = self._make_user("child@example.com")
        child_person = self._attach_person(child_user)

        self._add_relationship(subject_person=guardian_person, related_person=child_person)

        result = resolve_manageable_person_ids(self.db, guardian_user)

        self.assertEqual(result, {guardian_person.id, child_person.id})

    def test_multiple_children_all_included(self) -> None:
        guardian_user = self._make_user("guardian2@example.com")
        guardian_person = self._attach_person(guardian_user)
        child_a_user = self._make_user("child-a@example.com")
        child_a_person = self._attach_person(child_a_user)
        child_b_user = self._make_user("child-b@example.com")
        child_b_person = self._attach_person(child_b_user)

        self._add_relationship(subject_person=guardian_person, related_person=child_a_person)
        self._add_relationship(subject_person=guardian_person, related_person=child_b_person)

        result = resolve_manageable_person_ids(self.db, guardian_user)

        self.assertEqual(result, {guardian_person.id, child_a_person.id, child_b_person.id})

    # --- Unverified relationships ignored ---
    def test_unverified_relationship_ignored(self) -> None:
        guardian_user = self._make_user("guardian3@example.com")
        guardian_person = self._attach_person(guardian_user)
        child_user = self._make_user("child3@example.com")
        child_person = self._attach_person(child_user)

        self._add_relationship(subject_person=guardian_person, related_person=child_person, verified=False)

        result = resolve_manageable_person_ids(self.db, guardian_user)

        self.assertEqual(result, {guardian_person.id})

    # --- can_register_for=False does not grant management ---
    def test_relationship_without_can_register_for_ignored(self) -> None:
        guardian_user = self._make_user("guardian4@example.com")
        guardian_person = self._attach_person(guardian_user)
        contact_user = self._make_user("contact4@example.com")
        contact_person = self._attach_person(contact_user)

        self._add_relationship(
            subject_person=guardian_person, related_person=contact_person, can_register_for=False
        )

        result = resolve_manageable_person_ids(self.db, guardian_user)

        self.assertEqual(result, {guardian_person.id})

    # --- Revoked relationship ignored ---
    def test_revoked_relationship_ignored(self) -> None:
        guardian_user = self._make_user("guardian5@example.com")
        guardian_person = self._attach_person(guardian_user)
        child_user = self._make_user("child5@example.com")
        child_person = self._attach_person(child_user)

        self._add_relationship(
            subject_person=guardian_person,
            related_person=child_person,
            status=PersonRelationship.STATUS_REVOKED,
        )

        result = resolve_manageable_person_ids(self.db, guardian_user)

        self.assertEqual(result, {guardian_person.id})

    # --- Duplicate relationship paths deduplicated ---
    def test_duplicate_relationship_rows_deduplicated(self) -> None:
        guardian_user = self._make_user("guardian6@example.com")
        guardian_person = self._attach_person(guardian_user)
        child_user = self._make_user("child6@example.com")
        child_person = self._attach_person(child_user)

        self._add_relationship(subject_person=guardian_person, related_person=child_person)
        self._add_relationship(subject_person=guardian_person, related_person=child_person)

        result = resolve_manageable_person_ids(self.db, guardian_user)

        self.assertEqual(result, {guardian_person.id, child_person.id})
        self.assertEqual(len(result), 2)

    # --- Users without a valid Person ---
    def test_user_without_person_returns_empty_set(self) -> None:
        user = self._make_user("noperson@example.com")

        result = resolve_manageable_person_ids(self.db, user)

        self.assertEqual(result, set())

    # --- Relationship direction is not reversible ---
    def test_incoming_relationship_direction_not_included(self) -> None:
        # child_person is the *related* party in a relationship whose
        # subject is the guardian - the child must not "see" the guardian
        # as manageable merely because a relationship row links them.
        guardian_user = self._make_user("guardian7@example.com")
        guardian_person = self._attach_person(guardian_user)
        child_user = self._make_user("child7@example.com")
        child_person = self._attach_person(child_user)

        self._add_relationship(subject_person=guardian_person, related_person=child_person)

        result = resolve_manageable_person_ids(self.db, child_user)

        self.assertEqual(result, {child_person.id})


if __name__ == "__main__":
    unittest.main()
