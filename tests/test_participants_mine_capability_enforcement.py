from __future__ import annotations

import os
import unittest
import uuid
from unittest.mock import patch

os.environ.setdefault("DEBUG", "true")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.db.base import Base
from api.db.session import get_db
from api.dependencies import get_current_user, get_current_user_optional
from api.main import app
from api.models.person import Person
from api.models.person_role import PersonRole
from api.models.role import Role
from api.models.users import User
from api.services.authorization import ROLE_ADMIN, ROLE_PARTICIPANT


class ParticipantsMineCapabilityEnforcementTests(unittest.TestCase):
    """
    Phase 3C Slice B9 - GET /api/participants/mine is now decided solely
    by the Capability Resolution Engine (require_capability(), api/
    dependencies.py), replacing require_permission() outright. See
    PHASE3C_SLICE_B9_ARCHITECTURE_REVIEW.md.

    Proves: the endpoint preserves today's exact authorization outcomes
    (participant succeeds, admin is denied - both unchanged from legacy);
    the engine, not the legacy field, is what actually decides (forward-
    compatibility case, mirroring B3/B5/B8); and capability-resolution
    failures fail closed (403, never a fallback to legacy, never a 500).
    """

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            future=True,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
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
            PersonRole(id=uuid.uuid4(), person_id=person.id, role_code=role_code, status=PersonRole.STATUS_ACTIVE)
        )
        self.db.commit()

    def _authenticate(self, user: User) -> None:
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_current_user_optional] = lambda: user

    # --- Positive case ---

    def test_participant_with_legacy_role_only_succeeds(self) -> None:
        owner = self._make_user(ROLE_PARTICIPANT)  # no Person - legacy fallback path
        self._authenticate(owner)

        response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_participant_with_active_person_role_succeeds(self) -> None:
        # Forward-compatibility path: PersonRole-first resolution, not
        # the legacy fallback - proves the real engine decision, not
        # just the fallback branch, grants access.
        owner = self._make_user(ROLE_PARTICIPANT)
        person = self._attach_person(owner)
        self._grant_role(person, "participant")
        self._authenticate(owner)

        response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    # --- Regression case: admin denial is unchanged from legacy ---

    def test_admin_receives_403_unchanged_from_legacy_behavior(self) -> None:
        admin = self._make_user(ROLE_ADMIN)  # no Person - legacy fallback path
        self._authenticate(admin)

        response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 403)

    # --- Engine is the real decision-maker, not a stale legacy field ---

    def test_active_person_role_denial_overrides_stale_legacy_participant_role(self) -> None:
        # Legacy User.role says participant, but the active PersonRole
        # grants only admin - the capability engine must deny here,
        # proving it is genuinely consulted rather than the legacy
        # field being used as a shortcut.
        user = self._make_user(ROLE_PARTICIPANT)
        person = self._attach_person(user)
        self._grant_role(person, "admin")
        self._authenticate(user)

        response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 403)

    # --- Anonymous ---

    def test_anonymous_request_returns_401(self) -> None:
        response = self.client.get("/api/participants/mine")
        self.assertEqual(response.status_code, 401)

    # --- Fail-closed behavior ---

    def test_capability_resolution_error_fails_closed_not_500(self) -> None:
        owner = self._make_user(ROLE_PARTICIPANT)
        self._authenticate(owner)

        with patch("api.dependencies.has_capability", side_effect=RuntimeError("boom")):
            with self.assertLogs("api.dependencies", level="WARNING") as captured:
                response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 403)
        self.assertIn("capability_engine_authorization_error", captured.output[0])

    def test_capability_denial_is_logged(self) -> None:
        admin = self._make_user(ROLE_ADMIN)
        self._authenticate(admin)

        with self.assertLogs("api.dependencies", level="INFO") as captured:
            response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 403)
        self.assertIn("capability_engine_authorization_denied", captured.output[0])

    # --- The other self-service route is untouched by this slice ---

    def test_get_own_participant_route_still_uses_legacy_permission_dependency(self) -> None:
        # Only GET /participants/mine migrated in B9. GET /participants/
        # {participant_id} must still be reachable/deniable exactly as
        # before - a 404 (not 403) for a random id on an authenticated
        # participant proves require_permission() still granted entry
        # and the legacy dependency chain remains intact for this route.
        owner = self._make_user(ROLE_PARTICIPANT)
        self._authenticate(owner)

        response = self.client.get(f"/api/participants/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
