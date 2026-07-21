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
from api.main import app
from api.models.person import Person
from api.models.person_role import PersonRole
from api.models.role import Role
from api.models.users import User
from api.services.authorization import (
    PERMISSION_ADMIN_ACCESS,
    PERMISSION_PARTICIPANTS_VIEW_OWN,
    PERMISSION_WAIVERS_VIEW_OWN,
    ROLE_ADMIN,
    ROLE_PARTICIPANT,
)


class AuthMeCapabilitiesTests(unittest.TestCase):
    """
    Phase 3B Slice B8 - GET /auth/me's additive `capabilities` field.

    Proves: the field reflects the same capability set B3/B5/B6 already
    established as equivalent to legacy authorization; existing fields
    are completely unaffected; and - the single most important property
    of this slice - a failure inside capability resolution degrades
    gracefully (capabilities: null, everything else intact) rather than
    ever breaking this endpoint, which both the admin shell and the
    participant portal depend on to establish a session at all.
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

    def _make_user_and_login(self, *, role: str, email: str, password: str = "correcthorse123") -> str:
        from api.security import hash_password

        user = User(id=str(uuid.uuid4()), email=email, hashed_password=hash_password(password), role=role)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        login = self.client.post(
            "/api/auth/login", data={"username": email, "password": password}
        )
        self.assertEqual(login.status_code, 200)
        return login.json()["access_token"]

    def test_admin_capabilities_include_admin_access(self) -> None:
        token = self._make_user_and_login(role=ROLE_ADMIN, email="admin-caps@example.com")
        response = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["role"], ROLE_ADMIN)
        self.assertIn(PERMISSION_ADMIN_ACCESS, body["capabilities"])
        self.assertNotIn(PERMISSION_PARTICIPANTS_VIEW_OWN, body["capabilities"])

    def test_participant_capabilities_include_view_own_permissions(self) -> None:
        token = self._make_user_and_login(role=ROLE_PARTICIPANT, email="participant-caps@example.com")
        response = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["role"], ROLE_PARTICIPANT)
        self.assertIn(PERMISSION_PARTICIPANTS_VIEW_OWN, body["capabilities"])
        self.assertIn(PERMISSION_WAIVERS_VIEW_OWN, body["capabilities"])
        self.assertNotIn(PERMISSION_ADMIN_ACCESS, body["capabilities"])

    def test_capabilities_reflect_active_person_role_not_just_legacy(self) -> None:
        # Forward-compatibility case, mirroring B3/B5's own equivalence
        # tests: legacy User.role says participant, but an active
        # PersonRole grants admin - /auth/me must reflect the resolved
        # (PersonRole-first) result, not the raw legacy field.
        token = self._make_user_and_login(role=ROLE_PARTICIPANT, email="forward-compat@example.com")
        user = self.db.query(User).filter(User.email == "forward-compat@example.com").first()
        person = Person(id=uuid.uuid4(), user_id=user.id, email=user.email)
        self.db.add(person)
        self.db.commit()
        self.db.add(
            PersonRole(id=uuid.uuid4(), person_id=person.id, role_code="admin", status=PersonRole.STATUS_ACTIVE)
        )
        self.db.commit()

        response = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        body = response.json()
        self.assertEqual(body["role"], "participant")  # legacy field itself is untouched
        self.assertIn(PERMISSION_ADMIN_ACCESS, body["capabilities"])  # but resolution reflects PersonRole

    def test_existing_fields_unchanged_by_new_field(self) -> None:
        token = self._make_user_and_login(role=ROLE_PARTICIPANT, email="unchanged-fields@example.com")
        response = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

        body = response.json()
        self.assertEqual(body["email"], "unchanged-fields@example.com")
        self.assertEqual(body["role"], ROLE_PARTICIPANT)
        self.assertIsNone(body["email_verified_at"])
        self.assertIn("id", body)

    def test_capability_resolution_failure_degrades_gracefully(self) -> None:
        token = self._make_user_and_login(role=ROLE_ADMIN, email="degrade-me@example.com")

        with patch("api.routers.auth.resolve_capabilities", side_effect=RuntimeError("boom")):
            with self.assertLogs("api.routers.auth", level="WARNING") as captured:
                response = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

        # The single most important property of this slice: existing
        # fields survive completely intact, and the endpoint never 500s,
        # even though the new computation failed outright.
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["role"], ROLE_ADMIN)
        self.assertEqual(body["email"], "degrade-me@example.com")
        self.assertIsNone(body["capabilities"])
        self.assertIn("capability_engine_expose_error", captured.output[0])

    def test_unauthenticated_request_still_rejected(self) -> None:
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
