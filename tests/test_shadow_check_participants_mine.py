from __future__ import annotations

import logging
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
from api.routers.participant_self import _shadow_check_participants_view_own
from api.services.authorization import ROLE_PARTICIPANT


class ShadowCheckParticipantsMineTests(unittest.TestCase):
    """
    Phase 3B Slice B6 - shadow-check validation for GET /api/participants/mine.

    RETIRED as a live request-path concern as of Phase 3C Slice B9: this
    endpoint's authorization is now decided solely by the Capability
    Resolution Engine (require_capability()), so there is no separate
    legacy decision left for _shadow_check_participants_view_own() to
    shadow. The direct unit tests below still call that function
    directly and remain valid, unmodified historical evidence that the
    capability engine agreed with legacy authorization throughout B6's
    production observation window - the equivalence proof that made
    B9's direct replacement (no dual-decision period) safe. See
    PHASE3C_SLICE_B9_ARCHITECTURE_REVIEW.md §5 and §11.

    Proves (as of B6, still true of the function in isolation): a
    mismatch is logged with the expected structured fields and never
    raised; an internal error fails safe rather than blocking the
    caller.
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

    # --- Direct unit tests of the shadow-check helper ---

    def test_matches_and_logs_nothing_legacy_only(self) -> None:
        user = self._make_user()  # no Person at all - legacy fallback both sides
        with self.assertNoLogs("api.routers.participant_self", level="WARNING"):
            result = _shadow_check_participants_view_own(self.db, user)
        self.assertTrue(result)

    def test_matches_and_logs_nothing_with_matching_person_role(self) -> None:
        user = self._make_user()
        person = self._attach_person(user)
        self._grant_role(person, "participant")
        with self.assertNoLogs("api.routers.participant_self", level="WARNING"):
            result = _shadow_check_participants_view_own(self.db, user)
        self.assertTrue(result)

    def test_mismatch_is_logged_with_structured_fields_and_never_raises(self) -> None:
        user = self._make_user()
        self._attach_person(user)

        # Force a disagreement: the capability engine says "deny" (empty
        # grant set) while legacy (having reached this function at all)
        # says "allow" - this is a deliberately constructed divergence to
        # prove the logging mechanism itself, not a scenario reachable
        # with today's real resolution logic (which is why the
        # equivalence reports for B3/B5 show no real mismatches).
        from api.services.capability_resolution import CapabilityContext

        fake_context = CapabilityContext(actor_person=None, role_codes=(), used_legacy_fallback=True)
        with patch(
            "api.routers.participant_self.resolve_capabilities_with_context",
            return_value=(set(), fake_context),
        ):
            with self.assertLogs("api.routers.participant_self", level="WARNING") as captured:
                result = _shadow_check_participants_view_own(self.db, user)

        self.assertFalse(result)
        self.assertEqual(len(captured.output), 1)
        message = captured.output[0]
        self.assertIn("capability_engine_shadow_mismatch", message)
        self.assertIn("GET /api/participants/mine", message)
        self.assertIn("participants.view_own", message)
        self.assertIn(str(user.id), message)
        self.assertIn("legacy_decision=True", message)
        self.assertIn("engine_decision=False", message)
        self.assertIn("used_legacy_fallback=True", message)
        # No sensitive data (token/password) ever appears in the log line.
        self.assertNotIn("hashed_password", message)
        self.assertNotIn(user.email, message)

    def test_internal_error_is_caught_logged_and_never_raised(self) -> None:
        user = self._make_user()

        with patch(
            "api.routers.participant_self.resolve_capabilities_with_context",
            side_effect=RuntimeError("boom"),
        ):
            with self.assertLogs("api.routers.participant_self", level="WARNING") as captured:
                result = _shadow_check_participants_view_own(self.db, user)

        self.assertTrue(result)  # fails safe - never blocks or reports failure to the caller
        self.assertIn("capability_engine_shadow_check_error", captured.output[0])

    # --- Endpoint-level: proof of retirement as of Phase 3C Slice B9 ---

    def test_shadow_check_no_longer_invoked_by_endpoint_as_of_b9(self) -> None:
        # As of B9, GET /api/participants/mine is decided solely by
        # require_capability() - the route body no longer calls
        # _shadow_check_participants_view_own() at all. This replaces
        # B6's "invoked on every request" assertion with its direct
        # opposite, documenting the retirement rather than leaving a
        # stale, now-false assertion in place.
        owner = self._make_user()
        self._authenticate(owner)

        with patch(
            "api.routers.participant_self._shadow_check_participants_view_own",
            wraps=_shadow_check_participants_view_own,
        ) as spy:
            response = self.client.get("/api/participants/mine")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
        self.assertEqual(spy.call_count, 0)

    def test_unauthenticated_request_still_rejected(self) -> None:
        # No auth override - require_capability's own dependency chain
        # (get_current_user) still rejects this before the route body
        # ever executes, exactly as require_permission's did before B9.
        response = self.client.get("/api/participants/mine")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
