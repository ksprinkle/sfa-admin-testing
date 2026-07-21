from __future__ import annotations

import os
import unittest
import uuid
from datetime import date, timedelta
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
from api.models.events import Event
from api.models.participants import Participant
from api.models.person import Person
from api.models.person_role import PersonRole
from api.models.role import Role
from api.models.users import User
from api.services.authorization import ROLE_PARTICIPANT


class GetOwnParticipantCapabilityEnforcementTests(unittest.TestCase):
    """
    Phase 3C Slice B10 - GET /api/participants/{participant_id} is now
    decided solely by the Capability Resolution Engine
    (require_capability(), api/dependencies.py), the same dependency
    already proven live by B9 on GET /participants/mine, reusing the
    same permission (participants.view_own). See
    PHASE3C_SLICE_B10_ARCHITECTURE_REVIEW.md.

    Ownership scoping (owner/non-owner/unclaimed/admin-403) is already
    covered by tests/test_participant_identity.py and is unaffected by
    this slice - those tests keep passing unmodified, proving no
    regression. This file covers what's new: the engine is the real
    decision-maker (not a stale legacy field), anonymous rejection, and
    fail-closed behavior on an internal error - the same properties B9
    proved for its own endpoint.
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

    def _make_user(self, role: str = ROLE_PARTICIPANT) -> User:
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

    def _make_event(self) -> Event:
        event = Event(
            title="B10 Capability Enforcement Event",
            slug="b10-cap-" + uuid.uuid4().hex[:8],
            event_type="surf",
            status="published",
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=20),
            participant_open=True,
            volunteer_open=True,
            exhibitor_open=True,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def _make_owned_participant(self, *, owner: User) -> Participant:
        event = self._make_event()
        participant = Participant(
            event_id=event.id, first_name="Own", last_name="Record",
            email=f"{uuid.uuid4().hex[:8]}@example.com", role="participant", user_id=owner.id,
        )
        self.db.add(participant)
        self.db.commit()
        self.db.refresh(participant)
        return participant

    # --- The engine, not a stale legacy field, is the real decision-maker ---

    def test_participant_with_active_person_role_succeeds(self) -> None:
        # Forward-compatibility path: PersonRole-first resolution grants
        # access, not the legacy fallback - proves the real engine
        # decision (not just the fallback branch) is what's consulted.
        owner = self._make_user(ROLE_PARTICIPANT)
        person = self._attach_person(owner)
        self._grant_role(person, "participant")
        participant = self._make_owned_participant(owner=owner)
        self._authenticate(owner)

        response = self.client.get(f"/api/participants/{participant.id}")

        self.assertEqual(response.status_code, 200)

    def test_active_person_role_denial_overrides_stale_legacy_participant_role(self) -> None:
        # Legacy User.role says participant, but the active PersonRole
        # grants only admin - the capability engine must deny here,
        # proving it is genuinely consulted rather than the legacy
        # field being used as a shortcut.
        owner = self._make_user(ROLE_PARTICIPANT)
        person = self._attach_person(owner)
        self._grant_role(person, "admin")
        participant = self._make_owned_participant(owner=owner)
        self._authenticate(owner)

        response = self.client.get(f"/api/participants/{participant.id}")

        self.assertEqual(response.status_code, 403)

    # --- Anonymous ---

    def test_anonymous_request_returns_401(self) -> None:
        response = self.client.get(f"/api/participants/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 401)

    # --- Fail-closed behavior ---

    def test_capability_resolution_error_fails_closed_not_500(self) -> None:
        owner = self._make_user(ROLE_PARTICIPANT)
        participant = self._make_owned_participant(owner=owner)
        self._authenticate(owner)

        with patch("api.dependencies.has_capability", side_effect=RuntimeError("boom")):
            with self.assertLogs("api.dependencies", level="WARNING") as captured:
                response = self.client.get(f"/api/participants/{participant.id}")

        self.assertEqual(response.status_code, 403)
        self.assertIn("capability_engine_authorization_error", captured.output[0])

    def test_capability_denial_is_logged(self) -> None:
        from api.services.authorization import ROLE_ADMIN

        admin = self._make_user(ROLE_ADMIN)
        self._authenticate(admin)

        with self.assertLogs("api.dependencies", level="INFO") as captured:
            response = self.client.get(f"/api/participants/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 403)
        self.assertIn("capability_engine_authorization_denied", captured.output[0])


if __name__ == "__main__":
    unittest.main()
