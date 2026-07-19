from __future__ import annotations

import os
import unittest

os.environ.setdefault("DEBUG", "true")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.db.base import Base
from api.db.session import get_db
from api.main import app
from api.models.user_action_tokens import UserActionToken
from api.models.users import User
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


if __name__ == "__main__":
    unittest.main()
