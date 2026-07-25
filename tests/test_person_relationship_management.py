from __future__ import annotations

import os
import unittest
import uuid

os.environ.setdefault("DEBUG", "true")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.db.base import Base
from api.models.person import Person
from api.models.person_relationship import PersonRelationship
from api.models.users import User
from api.services.person_relationship_management import create_person_relationship


class PersonRelationshipManagementTests(unittest.TestCase):
    """
    Phase 3C Slice B13a - create_person_relationship().

    Proves relationship creation is immediately active and verified,
    with the creating admin recorded as verifier - the only behavior
    this slice's service layer is responsible for.
    """

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.SessionLocal()

        self.admin = User(id=str(uuid.uuid4()), email="admin@example.com", hashed_password="x", role="admin")
        self.subject_user = User(id=str(uuid.uuid4()), email="guardian@example.com", hashed_password="x", role="participant")
        self.related_user = User(id=str(uuid.uuid4()), email="child@example.com", hashed_password="x", role="participant")
        self.db.add_all([self.admin, self.subject_user, self.related_user])
        self.db.commit()

        self.subject_person = Person(id=uuid.uuid4(), user_id=self.subject_user.id, email=self.subject_user.email)
        self.related_person = Person(id=uuid.uuid4(), user_id=self.related_user.id, email=self.related_user.email)
        self.db.add_all([self.subject_person, self.related_person])
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_creates_active_and_verified_relationship(self) -> None:
        relationship = create_person_relationship(
            self.db,
            subject_person_id=self.subject_person.id,
            related_person_id=self.related_person.id,
            relationship_type="parent",
            can_register_for=True,
            verified_by_user_id=self.admin.id,
        )
        self.db.commit()
        self.db.refresh(relationship)

        self.assertEqual(relationship.status, PersonRelationship.STATUS_ACTIVE)
        self.assertIsNotNone(relationship.verified_at)
        self.assertEqual(relationship.verified_by_user_id, self.admin.id)
        self.assertTrue(relationship.can_register_for)
        self.assertEqual(relationship.subject_person_id, self.subject_person.id)
        self.assertEqual(relationship.related_person_id, self.related_person.id)

    def test_unspecified_capability_flags_default_false(self) -> None:
        relationship = create_person_relationship(
            self.db,
            subject_person_id=self.subject_person.id,
            related_person_id=self.related_person.id,
            relationship_type="emergency_contact",
            verified_by_user_id=self.admin.id,
        )
        self.db.commit()
        self.db.refresh(relationship)

        self.assertFalse(relationship.can_register_for)
        self.assertFalse(relationship.can_view_documents)
        self.assertFalse(relationship.can_manage_documents)
        self.assertFalse(relationship.can_receive_communications)
        self.assertFalse(relationship.is_emergency_contact_only)

    def test_persists_and_is_queryable(self) -> None:
        create_person_relationship(
            self.db,
            subject_person_id=self.subject_person.id,
            related_person_id=self.related_person.id,
            relationship_type="parent",
            can_register_for=True,
            verified_by_user_id=self.admin.id,
        )
        self.db.commit()

        stored = (
            self.db.query(PersonRelationship)
            .filter(
                PersonRelationship.subject_person_id == self.subject_person.id,
                PersonRelationship.related_person_id == self.related_person.id,
            )
            .first()
        )
        self.assertIsNotNone(stored)
        self.assertEqual(stored.relationship_type, "parent")


if __name__ == "__main__":
    unittest.main()
