from __future__ import annotations

import logging
import os
import unittest
import uuid
from datetime import date, datetime, timedelta
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
from api.models.person_relationship import PersonRelationship
from api.models.users import User
from api.routers.participant_self import (
    _shadow_check_get_own_participant,
    _shadow_check_list_own_registrations,
)


class ShadowCheckParticipantIdentityTests(unittest.TestCase):
    """
    Phase 3C Slice B13c - shadow-check validation for the ownership
    resolution engine (resolve_manageable_person_ids(), Slice B13b)
    against the live GET /api/participants/mine and GET /api/participants/
    {participant_id} endpoints.

    Proves: the engine reproduces Participant.user_id-based ownership
    exactly for the shapes of data that exist in production today
    (including the known B14 identity-claim gap, which both models read
    identically); a genuine divergence (e.g. relationship-based access
    the legacy model never consults) is logged, not acted on; an
    internal error in the shadow check never affects the response;
    nothing about either endpoint's response or status code changes.
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

    def _headless_person(self, email: str) -> Person:
        person = Person(id=uuid.uuid4(), user_id=None, email=email)
        self.db.add(person)
        self.db.commit()
        self.db.refresh(person)
        return person

    def _add_relationship(self, *, subject_person: Person, related_person: Person) -> None:
        self.db.add(
            PersonRelationship(
                id=uuid.uuid4(),
                subject_person_id=subject_person.id,
                related_person_id=related_person.id,
                relationship_type="parent",
                can_register_for=True,
                status=PersonRelationship.STATUS_ACTIVE,
                verified_at=datetime.utcnow(),
                verified_by_user_id=None,
            )
        )
        self.db.commit()

    def _make_event(self) -> Event:
        event = Event(
            title="Identity Slice Event",
            slug="b13c-" + uuid.uuid4().hex[:8],
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

    def _make_participant(self, *, event: Event, user_id, person_id, email: str) -> Participant:
        participant = Participant(
            event_id=event.id,
            first_name="Test",
            last_name="Participant",
            email=email,
            role="participant",
            user_id=user_id,
            person_id=person_id,
        )
        self.db.add(participant)
        self.db.commit()
        self.db.refresh(participant)
        return participant

    def _authenticate(self, user: User) -> None:
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_current_user_optional] = lambda: user

    # --- Direct unit tests: list endpoint ---

    def test_list_matches_and_logs_nothing_for_direct_ownership(self) -> None:
        owner = self._make_user("owner@example.com")
        person = self._attach_person(owner)
        event = self._make_event()
        participant = self._make_participant(event=event, user_id=owner.id, person_id=person.id, email=owner.email)

        with self.assertNoLogs("api.routers.participant_self", level="WARNING"):
            _shadow_check_list_own_registrations(self.db, current_user=owner, legacy_participants=[participant])

    def test_list_matches_and_logs_nothing_for_known_b14_parent_child_shape(self) -> None:
        # Reproduces today's real (if imperfect) production shape: a
        # parent-registered participant whose person_id was stamped to
        # the *parent's* own Person (the B14 gap), not a separate Person
        # for the child. Both the legacy query and the engine read this
        # same stored person_id, so they must still agree - this is the
        # ticket's explicit requirement that B13c not "fix" B14.
        parent = self._make_user("parent@example.com")
        parent_person = self._attach_person(parent)
        event = self._make_event()
        participant = self._make_participant(
            event=event, user_id=parent.id, person_id=parent_person.id, email="child@example.com"
        )

        with self.assertNoLogs("api.routers.participant_self", level="WARNING"):
            _shadow_check_list_own_registrations(self.db, current_user=parent, legacy_participants=[participant])

    def test_list_matches_and_logs_nothing_when_user_has_no_person(self) -> None:
        owner = self._make_user("noperson@example.com")

        with self.assertNoLogs("api.routers.participant_self", level="WARNING"):
            _shadow_check_list_own_registrations(self.db, current_user=owner, legacy_participants=[])

    def test_list_mismatch_logged_for_relationship_only_engine_access(self) -> None:
        # A genuine divergence: an active can_register_for relationship
        # grants the engine access to a participant the legacy user_id
        # model has never heard of (relationship-based claiming has
        # never fired in production) - exactly the kind of real
        # disagreement this slice exists to surface, not suppress.
        guardian = self._make_user("guardian@example.com")
        guardian_person = self._attach_person(guardian)
        child_person = self._headless_person("child2@example.com")
        self._add_relationship(subject_person=guardian_person, related_person=child_person)

        event = self._make_event()
        participant = self._make_participant(
            event=event, user_id=None, person_id=child_person.id, email="child2@example.com"
        )

        with self.assertLogs("api.routers.participant_self", level="WARNING") as captured:
            _shadow_check_list_own_registrations(self.db, current_user=guardian, legacy_participants=[])

        message = captured.output[0]
        self.assertIn("ownership_engine_shadow_mismatch", message)
        self.assertIn("GET /api/participants/mine", message)
        self.assertIn(str(participant.id), message)
        self.assertIn("legacy_ids=[]", message)

    def test_list_internal_error_is_caught_logged_and_never_raised(self) -> None:
        owner = self._make_user("erruser@example.com")

        with patch(
            "api.routers.participant_self.resolve_manageable_person_ids",
            side_effect=RuntimeError("boom"),
        ):
            with self.assertLogs("api.routers.participant_self", level="WARNING") as captured:
                _shadow_check_list_own_registrations(self.db, current_user=owner, legacy_participants=[])

        self.assertIn("ownership_engine_shadow_check_error", captured.output[0])
        self.assertNotIn("hashed_password", captured.output[0])

    # --- Direct unit tests: single-record endpoint ---

    def test_single_matches_and_logs_nothing_for_direct_ownership(self) -> None:
        owner = self._make_user("single-owner@example.com")
        person = self._attach_person(owner)
        event = self._make_event()
        participant = self._make_participant(event=event, user_id=owner.id, person_id=person.id, email=owner.email)

        with self.assertNoLogs("api.routers.participant_self", level="WARNING"):
            _shadow_check_get_own_participant(
                self.db, current_user=owner, participant_id=participant.id, legacy_found=True
            )

    def test_single_matches_and_logs_nothing_for_not_found(self) -> None:
        owner = self._make_user("single-owner2@example.com")
        self._attach_person(owner)

        with self.assertNoLogs("api.routers.participant_self", level="WARNING"):
            _shadow_check_get_own_participant(
                self.db, current_user=owner, participant_id=uuid.uuid4(), legacy_found=False
            )

    def test_single_mismatch_logged_for_relationship_only_engine_access(self) -> None:
        guardian = self._make_user("single-guardian@example.com")
        guardian_person = self._attach_person(guardian)
        child_person = self._headless_person("single-child@example.com")
        self._add_relationship(subject_person=guardian_person, related_person=child_person)

        event = self._make_event()
        participant = self._make_participant(
            event=event, user_id=None, person_id=child_person.id, email="single-child@example.com"
        )

        with self.assertLogs("api.routers.participant_self", level="WARNING") as captured:
            _shadow_check_get_own_participant(
                self.db, current_user=guardian, participant_id=participant.id, legacy_found=False
            )

        message = captured.output[0]
        self.assertIn("ownership_engine_shadow_mismatch", message)
        self.assertIn("GET /api/participants/{participant_id}", message)
        self.assertIn("legacy_decision=False", message)
        self.assertIn("engine_decision=True", message)

    def test_single_internal_error_is_caught_logged_and_never_raised(self) -> None:
        owner = self._make_user("single-erruser@example.com")

        with patch(
            "api.routers.participant_self.resolve_manageable_person_ids",
            side_effect=RuntimeError("boom"),
        ):
            with self.assertLogs("api.routers.participant_self", level="WARNING") as captured:
                _shadow_check_get_own_participant(
                    self.db, current_user=owner, participant_id=uuid.uuid4(), legacy_found=False
                )

        self.assertIn("ownership_engine_shadow_check_error", captured.output[0])

    # --- Endpoint-level: response/status unchanged regardless of shadow outcome ---

    def test_list_endpoint_response_unchanged_when_shadow_check_disagrees(self) -> None:
        guardian = self._make_user("endpoint-guardian@example.com")
        guardian_person = self._attach_person(guardian)
        child_person = self._headless_person("endpoint-child@example.com")
        self._add_relationship(subject_person=guardian_person, related_person=child_person)
        event = self._make_event()
        self._make_participant(event=event, user_id=None, person_id=child_person.id, email="endpoint-child@example.com")

        self._authenticate(guardian)

        with self.assertLogs("api.routers.participant_self", level="WARNING"):
            response = self.client.get("/api/participants/mine")

        # Legacy behavior (empty list - guardian owns nothing by user_id)
        # is exactly what the endpoint still returns, despite the engine
        # disagreeing internally.
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_single_endpoint_response_unchanged_when_shadow_check_disagrees(self) -> None:
        guardian = self._make_user("endpoint-single-guardian@example.com")
        guardian_person = self._attach_person(guardian)
        child_person = self._headless_person("endpoint-single-child@example.com")
        self._add_relationship(subject_person=guardian_person, related_person=child_person)
        event = self._make_event()
        participant = self._make_participant(
            event=event, user_id=None, person_id=child_person.id, email="endpoint-single-child@example.com"
        )

        self._authenticate(guardian)

        with self.assertLogs("api.routers.participant_self", level="WARNING"):
            response = self.client.get(f"/api/participants/{participant.id}")

        # Legacy behavior (404 - guardian doesn't own this by user_id) is
        # exactly what the endpoint still returns.
        self.assertEqual(response.status_code, 404)

    def test_list_endpoint_response_unchanged_when_shadow_check_errors(self) -> None:
        owner = self._make_user("endpoint-erruser@example.com")
        self._attach_person(owner)
        self._authenticate(owner)

        with patch(
            "api.routers.participant_self.resolve_manageable_person_ids",
            side_effect=RuntimeError("boom"),
        ):
            with self.assertLogs("api.routers.participant_self", level="WARNING"):
                response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_unauthenticated_request_still_rejected(self) -> None:
        response = self.client.get("/api/participants/mine")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
