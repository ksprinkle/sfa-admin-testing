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
from api.models.person_role import PersonRole
from api.models.role import Role
from api.models.users import User
from api.services.person_role_management import grant_person_role, revoke_person_role


class PersonRoleManagementTests(unittest.TestCase):
    """
    Phase 3C Slice B11 - grant_person_role() / revoke_person_role().

    Proves the get-or-reactivate idempotency the architecture review
    requires (api/models/person_role.py's UniqueConstraint on
    (person_id, role_code) means a blind insert on a repeated grant
    would raise an IntegrityError), and that revoke is a safe no-op
    when there's nothing active to revoke.
    """

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.SessionLocal()

        self.db.add(Role(id=uuid.uuid4(), code="participant", display_name="Participant"))
        self.db.add(Role(id=uuid.uuid4(), code="admin", display_name="Admin"))
        self.db.commit()

        user = User(id=str(uuid.uuid4()), email="grantee@example.com", hashed_password="x", role="participant")
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        self.person = Person(id=uuid.uuid4(), user_id=user.id, email=user.email)
        self.db.add(self.person)
        self.db.commit()
        self.db.refresh(self.person)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _active_grants(self) -> set[str]:
        rows = (
            self.db.query(PersonRole)
            .filter(PersonRole.person_id == self.person.id, PersonRole.status == PersonRole.STATUS_ACTIVE)
            .all()
        )
        return {row.role_code for row in rows}

    def test_grant_creates_active_row(self) -> None:
        grant_person_role(self.db, person=self.person, role_code="participant")
        self.db.commit()

        self.assertEqual(self._active_grants(), {"participant"})

    def test_grant_is_idempotent_no_duplicate_row(self) -> None:
        grant_person_role(self.db, person=self.person, role_code="participant")
        self.db.commit()
        grant_person_role(self.db, person=self.person, role_code="participant")
        self.db.commit()  # would raise IntegrityError if this inserted a second row

        count = (
            self.db.query(PersonRole)
            .filter(PersonRole.person_id == self.person.id, PersonRole.role_code == "participant")
            .count()
        )
        self.assertEqual(count, 1)

    def test_grant_reactivates_a_revoked_row_instead_of_inserting(self) -> None:
        grant_person_role(self.db, person=self.person, role_code="admin")
        self.db.commit()
        revoke_person_role(self.db, person=self.person, role_code="admin")
        self.db.commit()
        self.assertEqual(self._active_grants(), set())

        grant_person_role(self.db, person=self.person, role_code="admin")
        self.db.commit()

        self.assertEqual(self._active_grants(), {"admin"})
        count = (
            self.db.query(PersonRole)
            .filter(PersonRole.person_id == self.person.id, PersonRole.role_code == "admin")
            .count()
        )
        self.assertEqual(count, 1)

    def test_revoke_is_a_safe_noop_when_nothing_active(self) -> None:
        revoke_person_role(self.db, person=self.person, role_code="participant")
        self.db.commit()  # must not raise

        self.assertEqual(self._active_grants(), set())

    def test_revoke_then_grant_different_role_leaves_only_the_new_one_active(self) -> None:
        grant_person_role(self.db, person=self.person, role_code="participant")
        self.db.commit()

        revoke_person_role(self.db, person=self.person, role_code="participant")
        grant_person_role(self.db, person=self.person, role_code="admin")
        self.db.commit()

        self.assertEqual(self._active_grants(), {"admin"})


if __name__ == "__main__":
    unittest.main()
