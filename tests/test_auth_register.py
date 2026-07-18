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


if __name__ == "__main__":
    unittest.main()
