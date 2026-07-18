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
from api.models.waiver_templates import WaiverTemplate
from api.services.authorization import ROLE_PARTICIPANT


class MyRegistrationsTests(unittest.TestCase):
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

    def _make_user(self, user_id: str) -> User:
        user = User(id=user_id, email=f"{user_id}@example.com", hashed_password="x", role=ROLE_PARTICIPANT)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def _make_event(self, **overrides) -> Event:
        defaults = dict(
            title="My Registrations Test Event",
            slug="my-reg-" + uuid.uuid4().hex[:8],
            event_type="surf",
            status="published",
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=20),
            participant_open=True,
            volunteer_open=True,
            exhibitor_open=True,
            venue="Test Beach",
            city="Testville",
            state="FL",
        )
        defaults.update(overrides)
        event = Event(**defaults)
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def _make_participant(self, *, event: Event, user_id, **overrides) -> Participant:
        defaults = dict(
            event_id=event.id,
            first_name="Test",
            last_name="Participant",
            email=f"{uuid.uuid4().hex[:8]}@example.com",
            role="participant",
            user_id=user_id,
        )
        defaults.update(overrides)
        participant = Participant(**defaults)
        self.db.add(participant)
        self.db.commit()
        self.db.refresh(participant)
        return participant

    def _authenticate(self, user: User) -> None:
        # Both dependencies: get_current_user (required-auth endpoints, e.g.
        # /participants/mine) and get_current_user_optional (the public
        # registration endpoints, which use it to link a new registration to
        # the caller when one is authenticated).
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_current_user_optional] = lambda: user

    # --- Ownership scoping ---

    def test_returns_only_own_registrations(self) -> None:
        owner = self._make_user("owner-1")
        other = self._make_user("other-1")
        event = self._make_event()
        self._make_participant(event=event, user_id=owner.id, email="owner@example.com")
        self._make_participant(event=event, user_id=other.id, email="other@example.com")

        self._authenticate(owner)
        response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body), 1)

    def test_unclaimed_registrations_never_shown(self) -> None:
        owner = self._make_user("owner-2")
        event = self._make_event()
        self._make_participant(event=event, user_id=None, email="unclaimed@example.com")

        self._authenticate(owner)
        response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_removed_registrations_excluded(self) -> None:
        from datetime import datetime

        owner = self._make_user("owner-3")
        event = self._make_event()
        self._make_participant(
            event=event, user_id=owner.id, email="removed@example.com",
            removed_at=datetime.utcnow(), removed_reason_code="no_show",
        )

        self._authenticate(owner)
        response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    # --- Ordering ---

    def test_newest_first_ordering(self) -> None:
        from datetime import datetime

        owner = self._make_user("owner-4")
        event = self._make_event()
        # SQLite's CURRENT_TIMESTAMP default is second-resolution, so two
        # participants created within the same test can otherwise tie —
        # set created_at explicitly so the ordering assertion is meaningful.
        first = self._make_participant(event=event, user_id=owner.id, email="first@example.com")
        first.created_at = datetime(2026, 1, 1, 12, 0, 0)
        second = self._make_participant(event=event, user_id=owner.id, email="second@example.com")
        second.created_at = datetime(2026, 1, 1, 13, 0, 0)
        self.db.commit()

        self._authenticate(owner)
        response = self.client.get("/api/participants/mine")

        ids = [row["id"] for row in response.json()]
        self.assertEqual(ids, [str(second.id), str(first.id)])

    # --- Empty state ---

    def test_empty_list_when_no_registrations(self) -> None:
        owner = self._make_user("owner-5")
        self._authenticate(owner)

        response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    # --- Waiver status derivation ---

    def test_waiver_status_not_required_without_waiver_record(self) -> None:
        owner = self._make_user("owner-6")
        event = self._make_event()
        self._make_participant(event=event, user_id=owner.id, email="nowaiver@example.com")

        self._authenticate(owner)
        response = self.client.get("/api/participants/mine")

        self.assertEqual(response.json()[0]["waiver_status"], "not_required")

    def test_waiver_status_pending_before_signing(self) -> None:
        owner = self._make_user("owner-7")
        event = self._make_event()
        template = WaiverTemplate(title="T", version=1, status=WaiverTemplate.STATUS_ACTIVE, content="text")
        self.db.add(template)
        self.db.commit()

        self._authenticate(owner)
        register_response = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "Pending", "last_name": "Waiver", "email": "pending@example.com"},
        )
        self.assertTrue(register_response.json()["waiver"]["required"])

        response = self.client.get("/api/participants/mine")
        self.assertEqual(response.json()[0]["waiver_status"], "pending")

    def test_waiver_status_signed_after_signing(self) -> None:
        owner = self._make_user("owner-8")
        event = self._make_event()
        template = WaiverTemplate(title="T", version=1, status=WaiverTemplate.STATUS_ACTIVE, content="text")
        self.db.add(template)
        self.db.commit()

        self._authenticate(owner)
        register_response = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "Signed", "last_name": "Waiver", "email": "signed@example.com"},
        )
        token = register_response.json()["waiver"]["token"]
        sign_response = self.client.post(f"/api/waivers/sign/{token}", json={"accepted": True, "signer_name": "Signed Waiver"})
        self.assertEqual(sign_response.status_code, 200)

        response = self.client.get("/api/participants/mine")
        self.assertEqual(response.json()[0]["waiver_status"], "signed")

    # --- Waitlist display ---

    def test_waitlisted_registration_reflected(self) -> None:
        owner = self._make_user("owner-9")
        event = self._make_event(participant_capacity=1)
        self._make_participant(event=event, user_id=None, email="filler@example.com")

        self._authenticate(owner)
        response = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "Waitlisted", "last_name": "Person", "email": "waitlisted@example.com"},
        )
        self.assertTrue(response.json()["participant"]["is_waitlisted"])

        mine = self.client.get("/api/participants/mine")
        self.assertEqual(mine.json()[0]["is_waitlisted"], True)

    # --- No administrative fields leaked ---

    def test_response_has_no_administrative_fields(self) -> None:
        owner = self._make_user("owner-10")
        event = self._make_event()
        self._make_participant(event=event, user_id=owner.id, email="noadmin@example.com", notes="admin-only note")

        self._authenticate(owner)
        response = self.client.get("/api/participants/mine")

        row = response.json()[0]
        self.assertNotIn("notes", row)
        self.assertNotIn("email", row)
        self.assertNotIn("first_name", row)
        self.assertNotIn("removed_reason_code", row)

    # --- Unauthenticated ---

    def test_unauthenticated_request_rejected(self) -> None:
        response = self.client.get("/api/participants/mine")
        self.assertEqual(response.status_code, 401)

    # --- Route ordering sanity: /mine must not be swallowed by /{participant_id} ---

    def test_mine_route_not_shadowed_by_participant_id_route(self) -> None:
        owner = self._make_user("owner-11")
        self._authenticate(owner)

        response = self.client.get("/api/participants/mine")

        # A 422 here would mean Starlette tried to parse "mine" as a UUID
        # path parameter for GET /participants/{participant_id} instead.
        self.assertNotEqual(response.status_code, 422)
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
