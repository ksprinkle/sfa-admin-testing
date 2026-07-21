from __future__ import annotations

import os
import unittest
import uuid

os.environ.setdefault("DEBUG", "true")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.db.base import Base
from api.db.session import get_db
from api.dependencies import get_current_user
from api.main import app
from api.models.person import Person
from api.models.person_role import PersonRole
from api.models.role import Role
from api.models.users import User
from api.services.authorization import ROLE_ADMIN, ROLE_PARTICIPANT


class AdminRoleMutationPersonRoleSyncTests(unittest.TestCase):
    """
    Phase 3C Slice B11 - the three admin role-mutation endpoints in
    api/routers/auth.py now keep PersonRole synchronized with the
    legacy User.role field they've always written, closing the
    divergence KNOWN_TECHNICAL_DEBT.md flagged: previously, changing a
    role here had no effect on an account whose PersonRole already
    existed, since PersonRole-first resolution took precedence over the
    legacy field being updated here.

    Full endpoint behavior (404s, invalid-role 400s, audit events) is
    pre-existing and untested elsewhere by design (see CLAUDE.md's note
    that most routers carry lighter test coverage than the execution
    pipeline) - this file only proves the new PersonRole-sync behavior
    introduced by this slice, on the one representative endpoint
    (`PUT /admin/users/{user_id}/role`) plus one confirmation per sibling
    endpoint that the same fix was applied there too.
    """

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

        self.client = TestClient(app)
        self.original_overrides = dict(app.dependency_overrides)
        app.dependency_overrides.clear()
        app.dependency_overrides[get_db] = self._override_get_db

        self.db = self.SessionLocal()
        self.db.add(Role(id=uuid.uuid4(), code="participant", display_name="Participant"))
        self.db.add(Role(id=uuid.uuid4(), code="admin", display_name="Admin"))
        self.db.commit()

        self.admin = User(id=str(uuid.uuid4()), email="admin-actor@example.com", hashed_password="x", role=ROLE_ADMIN)
        self.db.add(self.admin)
        self.db.commit()
        self.db.refresh(self.admin)
        app.dependency_overrides[get_current_user] = lambda: self.admin

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.original_overrides)
        self.db.close()
        self.engine.dispose()

    def _override_get_db(self):
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def _make_user_with_person(self, *, role: str, email: str) -> tuple[User, Person]:
        user = User(id=str(uuid.uuid4()), email=email, hashed_password="x", role=role)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        person = Person(id=uuid.uuid4(), user_id=user.id, email=email)
        self.db.add(person)
        self.db.commit()
        self.db.refresh(person)
        return user, person

    def _active_grants(self, person: Person) -> set[str]:
        rows = (
            self.db.query(PersonRole)
            .filter(PersonRole.person_id == person.id, PersonRole.status == PersonRole.STATUS_ACTIVE)
            .all()
        )
        return {row.role_code for row in rows}

    # --- Representative endpoint: PUT /admin/users/{user_id}/role ---

    def test_role_change_grants_new_role_when_no_prior_person_role_existed(self) -> None:
        user, person = self._make_user_with_person(role=ROLE_PARTICIPANT, email="no-prior@example.com")

        response = self.client.put(
            f"/api/auth/admin/users/{user.id}/role", params={"new_role": "admin"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._active_grants(person), {"admin"})

    def test_role_change_revokes_stale_person_role_and_grants_new_one(self) -> None:
        # This is the exact divergence scenario the review flagged: the
        # account already has an active PersonRole from an earlier
        # backfill/grant, disagreeing with the role this endpoint is
        # about to set.
        user, person = self._make_user_with_person(role=ROLE_PARTICIPANT, email="has-stale@example.com")
        self.db.add(
            PersonRole(id=uuid.uuid4(), person_id=person.id, role_code="participant", status=PersonRole.STATUS_ACTIVE)
        )
        self.db.commit()

        response = self.client.put(
            f"/api/auth/admin/users/{user.id}/role", params={"new_role": "admin"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._active_grants(person), {"admin"})

    def test_role_change_is_idempotent_when_setting_the_same_role_again(self) -> None:
        user, person = self._make_user_with_person(role=ROLE_ADMIN, email="same-role@example.com")
        self.db.add(
            PersonRole(id=uuid.uuid4(), person_id=person.id, role_code="admin", status=PersonRole.STATUS_ACTIVE)
        )
        self.db.commit()

        response = self.client.put(
            f"/api/auth/admin/users/{user.id}/role", params={"new_role": "admin"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._active_grants(person), {"admin"})
        count = (
            self.db.query(PersonRole)
            .filter(PersonRole.person_id == person.id, PersonRole.role_code == "admin")
            .count()
        )
        self.assertEqual(count, 1)  # no duplicate row from the redundant grant

    def test_role_change_gracefully_skips_sync_when_no_person_exists(self) -> None:
        # A user with no correlated Person at all (shouldn't happen for
        # any account created via register() post-B7, but defensive
        # nonetheless) must not break the endpoint.
        user = User(id=str(uuid.uuid4()), email="no-person@example.com", hashed_password="x", role=ROLE_PARTICIPANT)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        response = self.client.put(
            f"/api/auth/admin/users/{user.id}/role", params={"new_role": "admin"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], "admin")

    # --- Sibling endpoints: confirm the same fix was applied ---

    def test_role_change_by_email_syncs_person_role(self) -> None:
        user, person = self._make_user_with_person(role=ROLE_PARTICIPANT, email="by-email@example.com")

        response = self.client.put(
            "/api/auth/admin/users/by-email/role",
            params={"email": "by-email@example.com", "new_role": "admin"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._active_grants(person), {"admin"})

    def test_role_change_by_email_body_syncs_person_role(self) -> None:
        user, person = self._make_user_with_person(role=ROLE_PARTICIPANT, email="by-email-body@example.com")

        response = self.client.put(
            "/api/auth/admin/users/by-email/role-body",
            json={"email": "by-email-body@example.com", "new_role": "admin"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._active_grants(person), {"admin"})


if __name__ == "__main__":
    unittest.main()
