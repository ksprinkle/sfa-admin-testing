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
from api.main import app
from api.models.admin_audit_events import AdminAuditEvent
from api.models.events import Event
from api.models.participants import Participant
from api.models.user_action_tokens import UserActionToken
from api.models.users import User
from api.services.email_delivery import DeliveryResult, DeliveryStatus
from api.services.rate_limiting import _request_log
from api.utils.email_normalization import normalize_email


class EmailNormalizationTests(unittest.TestCase):
    def test_strips_and_lowercases(self) -> None:
        self.assertEqual(normalize_email("  User@Example.COM  "), "user@example.com")

    def test_none_becomes_empty_string(self) -> None:
        self.assertEqual(normalize_email(None), "")


class RegisterEndpointTests(unittest.TestCase):
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

        # Rate limiting is keyed process-wide (not per-test-db), so start
        # each test with a clean slate to avoid cross-test interference.
        _request_log.clear()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.original_overrides)
        self.db.close()
        self.engine.dispose()
        _request_log.clear()

    def _override_get_db(self):
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def test_successful_registration(self) -> None:
        response = self.client.post(
            "/api/auth/register", json={"email": "new.participant@example.com", "password": "correcthorse"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"message": "User created successfully"})

        stored = self.db.query(User).filter(User.email == "new.participant@example.com").first()
        self.assertIsNotNone(stored)
        self.assertEqual(stored.role, "participant")

    def test_email_is_normalized_before_storage(self) -> None:
        self.client.post(
            "/api/auth/register", json={"email": "  Mixed.Case@Example.COM ", "password": "correcthorse"}
        )

        stored = self.db.query(User).filter(User.email == "mixed.case@example.com").first()
        self.assertIsNotNone(stored)

    def test_case_insensitive_duplicate_rejected(self) -> None:
        first = self.client.post(
            "/api/auth/register", json={"email": "dup@example.com", "password": "correcthorse"}
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            "/api/auth/register", json={"email": "DUP@EXAMPLE.COM", "password": "anotherpassword"}
        )
        self.assertEqual(second.status_code, 400)
        self.assertEqual(self.db.query(User).count(), 1)

    def test_password_too_short_rejected(self) -> None:
        response = self.client.post(
            "/api/auth/register", json={"email": "shortpass@example.com", "password": "short"}
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.query(User).count(), 0)

    def test_invalid_email_format_rejected(self) -> None:
        response = self.client.post(
            "/api/auth/register", json={"email": "not-an-email", "password": "correcthorse"}
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.query(User).count(), 0)

    def test_rate_limit_blocks_excess_requests(self) -> None:
        for i in range(5):
            response = self.client.post(
                "/api/auth/register",
                json={"email": f"rl{i}@example.com", "password": "correcthorse"},
            )
            self.assertEqual(response.status_code, 200, f"request {i} should succeed")

        blocked = self.client.post(
            "/api/auth/register", json={"email": "rl-blocked@example.com", "password": "correcthorse"}
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(self.db.query(User).count(), 5)


class VerifyEmailEndpointTests(unittest.TestCase):
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
        _request_log.clear()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.original_overrides)
        self.db.close()
        self.engine.dispose()
        _request_log.clear()

    def _override_get_db(self):
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def _register(self, email: str) -> None:
        response = self.client.post(
            "/api/auth/register", json={"email": email, "password": "correcthorse"}
        )
        self.assertEqual(response.status_code, 200)

    def test_registration_creates_verification_token(self) -> None:
        self._register("verify-me@example.com")

        user = self.db.query(User).filter(User.email == "verify-me@example.com").first()
        self.assertIsNotNone(user)
        self.assertIsNone(user.email_verified_at)

        token = (
            self.db.query(UserActionToken)
            .filter(UserActionToken.user_id == user.id)
            .first()
        )
        self.assertIsNotNone(token)
        self.assertEqual(token.purpose, UserActionToken.PURPOSE_EMAIL_VERIFICATION)
        self.assertEqual(token.status, UserActionToken.STATUS_ACTIVE)

    def test_confirm_with_valid_token_verifies_user(self) -> None:
        from api.services.account_verification import create_verification_token

        user = User(email="confirm-me@example.com", hashed_password="x", role="participant")
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        _, raw_token = create_verification_token(self.db, user=user)
        self.db.commit()

        response = self.client.post("/api/auth/verify-email/confirm", json={"token": raw_token})
        self.assertEqual(response.status_code, 200)

        self.db.refresh(user)
        self.assertIsNotNone(user.email_verified_at)

    def test_confirm_with_reused_token_fails(self) -> None:
        from api.services.account_verification import create_verification_token

        user = User(email="reuse-me@example.com", hashed_password="x", role="participant")
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        _, raw_token = create_verification_token(self.db, user=user)
        self.db.commit()

        first = self.client.post("/api/auth/verify-email/confirm", json={"token": raw_token})
        self.assertEqual(first.status_code, 200)

        second = self.client.post("/api/auth/verify-email/confirm", json={"token": raw_token})
        self.assertEqual(second.status_code, 400)

    def test_confirm_with_expired_token_fails(self) -> None:
        from api.services.account_verification import create_verification_token

        user = User(email="expired-me@example.com", hashed_password="x", role="participant")
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        _, raw_token = create_verification_token(self.db, user=user, expires_in_minutes=-1)
        self.db.commit()

        response = self.client.post("/api/auth/verify-email/confirm", json={"token": raw_token})
        self.assertEqual(response.status_code, 400)

        self.db.refresh(user)
        self.assertIsNone(user.email_verified_at)

    def test_confirm_with_invalid_token_fails(self) -> None:
        response = self.client.post(
            "/api/auth/verify-email/confirm", json={"token": "not-a-real-token"}
        )
        self.assertEqual(response.status_code, 400)

    def test_resend_invalidates_prior_token_and_issues_new_one(self) -> None:
        self._register("resend-me@example.com")

        user = self.db.query(User).filter(User.email == "resend-me@example.com").first()
        original_token = (
            self.db.query(UserActionToken)
            .filter(UserActionToken.user_id == user.id)
            .first()
        )

        response = self.client.post(
            "/api/auth/verify-email/resend", json={"email": "resend-me@example.com"}
        )
        self.assertEqual(response.status_code, 200)

        self.db.refresh(original_token)
        self.assertEqual(original_token.status, UserActionToken.STATUS_INVALIDATED)

        active_tokens = (
            self.db.query(UserActionToken)
            .filter(
                UserActionToken.user_id == user.id,
                UserActionToken.status == UserActionToken.STATUS_ACTIVE,
            )
            .count()
        )
        self.assertEqual(active_tokens, 1)

    def test_resend_for_unknown_email_does_not_error(self) -> None:
        response = self.client.post(
            "/api/auth/verify-email/resend", json={"email": "no-such-user@example.com"}
        )
        self.assertEqual(response.status_code, 200)

    def test_registration_does_not_change_login_behavior(self) -> None:
        self._register("login-unaffected@example.com")

        response = self.client.post(
            "/api/auth/login",
            data={"username": "login-unaffected@example.com", "password": "correcthorse"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access_token", response.json())


class ParticipantClaimingTests(unittest.TestCase):
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
        _request_log.clear()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.original_overrides)
        self.db.close()
        self.engine.dispose()
        _request_log.clear()

    def _override_get_db(self):
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def _make_event(self, **overrides) -> Event:
        defaults = dict(
            title="Claiming Slice Event",
            slug="claiming-slice-" + uuid.uuid4().hex[:8],
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

    def _make_participant(self, *, event: Event, email: str, user_id: str | None = None) -> Participant:
        participant = Participant(
            event_id=event.id,
            first_name="Anon",
            last_name="Registrant",
            email=email,
            role="participant",
            user_id=user_id,
        )
        self.db.add(participant)
        self.db.commit()
        self.db.refresh(participant)
        return participant

    def _register_and_verify(self, email: str) -> tuple[User, dict]:
        from api.services.account_verification import create_verification_token

        response = self.client.post(
            "/api/auth/register", json={"email": email, "password": "correcthorse"}
        )
        self.assertEqual(response.status_code, 200)

        user = self.db.query(User).filter(User.email == normalize_email(email)).first()
        # Registration already issued a verification token; invalidate it and
        # issue a fresh one directly so the raw value is available to confirm with
        # (only the hash is ever persisted).
        _, raw_token = create_verification_token(self.db, user=user)
        self.db.commit()

        confirm = self.client.post("/api/auth/verify-email/confirm", json={"token": raw_token})
        self.assertEqual(confirm.status_code, 200)
        return user, confirm.json()

    def test_verify_with_no_historical_registrations_claims_nothing(self) -> None:
        _, body = self._register_and_verify("no-history@example.com")
        self.assertEqual(body["claimed_registrations"], 0)

    def test_verify_with_one_anonymous_registration_claims_it(self) -> None:
        event = self._make_event()
        participant = self._make_participant(event=event, email="one-anon@example.com")

        user, body = self._register_and_verify("one-anon@example.com")
        self.assertEqual(body["claimed_registrations"], 1)

        self.db.refresh(participant)
        self.assertEqual(participant.user_id, user.id)

    def test_verify_with_multiple_anonymous_registrations_claims_all(self) -> None:
        # Separate events: participants.(event_id, email) is unique, so multiple
        # registrations under one email are naturally for different events.
        p1 = self._make_participant(event=self._make_event(), email="multi-anon@example.com")
        p2 = self._make_participant(event=self._make_event(), email="multi-anon@example.com")
        p3 = self._make_participant(event=self._make_event(), email="multi-anon@example.com")

        user, body = self._register_and_verify("multi-anon@example.com")
        self.assertEqual(body["claimed_registrations"], 3)

        for p in (p1, p2, p3):
            self.db.refresh(p)
            self.assertEqual(p.user_id, user.id)

    def test_verify_never_overwrites_existing_linked_participant(self) -> None:
        event = self._make_event()
        other_user = User(email="other-owner@example.com", hashed_password="x", role="participant")
        self.db.add(other_user)
        self.db.commit()
        self.db.refresh(other_user)

        already_linked = self._make_participant(
            event=event, email="already-linked@example.com", user_id=other_user.id
        )

        user, body = self._register_and_verify("already-linked@example.com")
        self.assertEqual(body["claimed_registrations"], 0)

        self.db.refresh(already_linked)
        self.assertEqual(already_linked.user_id, other_user.id)
        self.assertNotEqual(already_linked.user_id, user.id)

    def test_claiming_creates_one_audit_event_per_claimed_participant(self) -> None:
        p1 = self._make_participant(event=self._make_event(), email="audit-me@example.com")
        p2 = self._make_participant(event=self._make_event(), email="audit-me@example.com")

        user, body = self._register_and_verify("audit-me@example.com")
        self.assertEqual(body["claimed_registrations"], 2)

        events = (
            self.db.query(AdminAuditEvent)
            .filter(AdminAuditEvent.action == "participant_account_claimed")
            .all()
        )
        self.assertEqual(len(events), 2)
        claimed_participant_ids = {str(p1.id), str(p2.id)}
        self.assertEqual({e.target_id for e in events}, claimed_participant_ids)
        for e in events:
            self.assertEqual(e.domain, "participants")
            self.assertEqual(e.actor_user_id, user.id)

    def test_repeated_claim_call_produces_no_duplicate_claims_or_audit_events(self) -> None:
        from api.services.participant_claiming import claim_participants_for_user

        event = self._make_event()
        self._make_participant(event=event, email="idempotent@example.com")

        user = User(email="idempotent@example.com", hashed_password="x", role="participant")
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        first = claim_participants_for_user(self.db, user)
        self.db.commit()
        self.assertEqual(first.count, 1)

        second = claim_participants_for_user(self.db, user)
        self.db.commit()
        self.assertEqual(second.count, 0)

        events = (
            self.db.query(AdminAuditEvent)
            .filter(AdminAuditEvent.action == "participant_account_claimed")
            .all()
        )
        self.assertEqual(len(events), 1)

    def test_claimed_registration_immediately_visible_on_my_registrations(self) -> None:
        event = self._make_event()
        self._make_participant(event=event, email="visible-me@example.com")

        self._register_and_verify("visible-me@example.com")

        login = self.client.post(
            "/api/auth/login",
            data={"username": "visible-me@example.com", "password": "correcthorse"},
        )
        self.assertEqual(login.status_code, 200)
        token = login.json()["access_token"]

        mine = self.client.get("/api/participants/mine", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(len(mine.json()), 1)

    def test_normalization_claims_case_and_whitespace_variant_emails(self) -> None:
        # Proves matching goes through the shared normalize_email() helper, not a
        # raw/exact comparison: all three rows normalize to "test@example.com".
        p1 = self._make_participant(event=self._make_event(), email="test@example.com")
        p2 = self._make_participant(event=self._make_event(), email="TEST@example.com")
        p3 = self._make_participant(event=self._make_event(), email=" test@example.com ")

        user, body = self._register_and_verify("test@example.com")
        self.assertEqual(body["claimed_registrations"], 3)

        for p in (p1, p2, p3):
            self.db.refresh(p)
            self.assertEqual(p.user_id, user.id)


class EmailDeliveryFailureTests(unittest.TestCase):
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
        _request_log.clear()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.original_overrides)
        self.db.close()
        self.engine.dispose()
        _request_log.clear()

    def _override_get_db(self):
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def _failing_provider(self):
        provider = type("FailingProvider", (), {})()
        provider.key = "email.smtp"
        provider.send = lambda request: DeliveryResult(
            status=DeliveryStatus.FAILED,
            provider="email.smtp",
            error_code="smtp_failure",
            error_message="Connection refused",
        )
        return provider

    def test_registration_still_succeeds_when_email_delivery_fails(self) -> None:
        with patch("api.services.account_verification.get_email_provider", return_value=self._failing_provider()):
            response = self.client.post(
                "/api/auth/register", json={"email": "delivery-fail@example.com", "password": "correcthorse"}
            )
        self.assertEqual(response.status_code, 200)

        user = self.db.query(User).filter(User.email == "delivery-fail@example.com").first()
        self.assertIsNotNone(user)

    def test_resend_surfaces_a_real_error_when_email_delivery_fails(self) -> None:
        response = self.client.post(
            "/api/auth/register", json={"email": "resend-fail@example.com", "password": "correcthorse"}
        )
        self.assertEqual(response.status_code, 200)

        with patch("api.services.account_verification.get_email_provider", return_value=self._failing_provider()):
            resend = self.client.post(
                "/api/auth/verify-email/resend", json={"email": "resend-fail@example.com"}
            )
        self.assertEqual(resend.status_code, 502)


if __name__ == "__main__":
    unittest.main()
