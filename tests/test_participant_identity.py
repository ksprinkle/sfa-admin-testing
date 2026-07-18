from __future__ import annotations

import os
import unittest
import uuid
from datetime import date, timedelta

os.environ.setdefault("DEBUG", "true")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.db.base import Base
from api.db.session import get_db
from api.dependencies import get_current_user, get_current_user_optional
from api.main import app
from api.models.events import Event
from api.models.participants import Participant
from api.models.users import User
from api.security import hash_password
from api.services.authorization import (
    PERMISSION_ADMIN_ACCESS,
    PERMISSION_PARTICIPANTS_MANAGE,
    PERMISSION_PARTICIPANTS_VIEW_OWN,
    PERMISSION_WAIVERS_VIEW_OWN,
    ROLE_ADMIN,
    ROLE_PARTICIPANT,
    has_permission,
    permissions_for_role,
)


class RolePermissionMatrixTests(unittest.TestCase):
    def test_participant_role_has_only_view_own_permissions(self) -> None:
        self.assertEqual(
            permissions_for_role(ROLE_PARTICIPANT),
            {PERMISSION_PARTICIPANTS_VIEW_OWN, PERMISSION_WAIVERS_VIEW_OWN},
        )

    def test_participant_role_cannot_reach_admin_permissions(self) -> None:
        participant = User(id="p1", email="p1@example.com", hashed_password="x", role=ROLE_PARTICIPANT)

        self.assertFalse(has_permission(participant, PERMISSION_ADMIN_ACCESS))
        self.assertFalse(has_permission(participant, PERMISSION_PARTICIPANTS_MANAGE))

    def test_admin_role_permissions_unaffected(self) -> None:
        admin = User(id="a1", email="a1@example.com", hashed_password="x", role=ROLE_ADMIN)

        self.assertTrue(has_permission(admin, PERMISSION_ADMIN_ACCESS))
        self.assertTrue(has_permission(admin, PERMISSION_PARTICIPANTS_MANAGE))
        # Admin was not implicitly granted the new self-service permissions —
        # it reaches participant/waiver data through its own *.manage routes.
        self.assertFalse(has_permission(admin, PERMISSION_PARTICIPANTS_VIEW_OWN))


class AuthAndOwnershipRouterTests(unittest.TestCase):
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

    def _make_user(self, *, role: str, email: str, password: str = "correct horse battery staple") -> User:
        user = User(id=str(uuid.uuid4()), email=email, hashed_password=hash_password(password), role=role)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def _login(self, *, email: str, password: str) -> str:
        response = self.client.post(
            "/api/auth/login",
            data={"username": email, "password": password},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    # --- Backward compatibility: existing admin login/authorization flow ---

    def test_admin_login_still_works_end_to_end(self) -> None:
        self._make_user(role=ROLE_ADMIN, email="admin@example.com", password="adminpass123")

        token = self._login(email="admin@example.com", password="adminpass123")

        me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["role"], ROLE_ADMIN)

        admin_only = self.client.get(
            "/api/auth/admin/users", headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(admin_only.status_code, 200)

    # --- Participant authentication works ---

    def test_participant_login_works_end_to_end(self) -> None:
        self._make_user(role=ROLE_PARTICIPANT, email="participant@example.com", password="surfsup123")

        token = self._login(email="participant@example.com", password="surfsup123")

        me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["role"], ROLE_PARTICIPANT)

    # --- Unauthorized access to admin endpoints is denied ---

    def test_participant_token_denied_on_admin_endpoint(self) -> None:
        self._make_user(role=ROLE_PARTICIPANT, email="participant2@example.com", password="surfsup123")
        token = self._login(email="participant2@example.com", password="surfsup123")

        response = self.client.get(
            "/api/auth/admin/users", headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(response.status_code, 403)

    def test_no_token_denied_on_admin_endpoint(self) -> None:
        response = self.client.get("/api/auth/admin/users")
        self.assertEqual(response.status_code, 401)

    # --- Participant permissions restricted to their own data ---

    def _make_event(self, **overrides) -> Event:
        defaults = dict(
            title="Identity Slice Event",
            slug="identity-slice-" + uuid.uuid4().hex[:8],
            event_type="surf",
            status="published",
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=20),
            participant_open=True,
            volunteer_open=True,
            exhibitor_open=True,
        )
        defaults.update(overrides)
        event = Event(**defaults)
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def test_participant_can_view_own_participant_record(self) -> None:
        owner = self._make_user(role=ROLE_PARTICIPANT, email="owner@example.com")
        event = self._make_event()
        participant = Participant(
            event_id=event.id, first_name="Own", last_name="Record",
            email="own@example.com", role="participant", user_id=owner.id,
        )
        self.db.add(participant)
        self.db.commit()
        self.db.refresh(participant)

        app.dependency_overrides[get_current_user] = lambda: owner

        response = self.client.get(f"/api/participants/{participant.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], "own@example.com")

    def test_participant_cannot_view_others_participant_record(self) -> None:
        owner = self._make_user(role=ROLE_PARTICIPANT, email="owner2@example.com")
        other = self._make_user(role=ROLE_PARTICIPANT, email="other2@example.com")
        event = self._make_event()
        participant = Participant(
            event_id=event.id, first_name="Owned", last_name="ByOther",
            email="owned@example.com", role="participant", user_id=owner.id,
        )
        self.db.add(participant)
        self.db.commit()
        self.db.refresh(participant)

        app.dependency_overrides[get_current_user] = lambda: other

        response = self.client.get(f"/api/participants/{participant.id}")
        self.assertEqual(response.status_code, 404)

    def test_participant_cannot_view_unclaimed_participant_record(self) -> None:
        # Admin-created / anonymous public registrations have user_id = None;
        # no participant account should be able to claim them by guessing an id.
        requester = self._make_user(role=ROLE_PARTICIPANT, email="requester@example.com")
        event = self._make_event()
        participant = Participant(
            event_id=event.id, first_name="Unclaimed", last_name="Row",
            email="unclaimed@example.com", role="participant", user_id=None,
        )
        self.db.add(participant)
        self.db.commit()
        self.db.refresh(participant)

        app.dependency_overrides[get_current_user] = lambda: requester

        response = self.client.get(f"/api/participants/{participant.id}")
        self.assertEqual(response.status_code, 404)

    def test_admin_role_cannot_use_participant_self_service_endpoint(self) -> None:
        # admin lacks participants.view_own by design (it has its own
        # dedicated admin endpoints); confirms permission strings are
        # exact, not "any authenticated user".
        admin = self._make_user(role=ROLE_ADMIN, email="admin2@example.com")
        event = self._make_event()
        participant = Participant(
            event_id=event.id, first_name="Some", last_name="Body",
            email="somebody@example.com", role="participant", user_id=admin.id,
        )
        self.db.add(participant)
        self.db.commit()
        self.db.refresh(participant)

        app.dependency_overrides[get_current_user] = lambda: admin

        response = self.client.get(f"/api/participants/{participant.id}")
        self.assertEqual(response.status_code, 403)

    # --- Registration ownership linkage ---

    def test_registration_links_to_authenticated_participant(self) -> None:
        owner = self._make_user(role=ROLE_PARTICIPANT, email="registrant@example.com")
        event = self._make_event()

        app.dependency_overrides[get_current_user_optional] = lambda: owner

        response = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "Reg", "last_name": "Istrant", "email": "reg@example.com"},
        )
        self.assertEqual(response.status_code, 201, response.text)

        created = self.db.query(Participant).filter(Participant.email == "reg@example.com").first()
        self.assertIsNotNone(created)
        self.assertEqual(created.user_id, owner.id)

    def test_registration_stays_anonymous_without_token(self) -> None:
        event = self._make_event()

        response = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "Anon", "last_name": "Ymous", "email": "anon@example.com"},
        )
        self.assertEqual(response.status_code, 201, response.text)

        created = self.db.query(Participant).filter(Participant.email == "anon@example.com").first()
        self.assertIsNotNone(created)
        self.assertIsNone(created.user_id)

    def test_registration_does_not_link_admin_token(self) -> None:
        admin = self._make_user(role=ROLE_ADMIN, email="admin3@example.com")
        event = self._make_event()

        app.dependency_overrides[get_current_user_optional] = lambda: admin

        response = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "Not", "last_name": "Linked", "email": "notlinked@example.com"},
        )
        self.assertEqual(response.status_code, 201, response.text)

        created = self.db.query(Participant).filter(Participant.email == "notlinked@example.com").first()
        self.assertIsNotNone(created)
        self.assertIsNone(created.user_id)


if __name__ == "__main__":
    unittest.main()
