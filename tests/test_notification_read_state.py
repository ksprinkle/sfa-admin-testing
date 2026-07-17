from __future__ import annotations

import os
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DEBUG", "true")

from api.db.base import Base
from api.db.session import get_db
from api.dependencies import get_current_user
from api.main import app
from api.services.notification_read_state import (
    list_read_notification_keys,
    upsert_read_notification_keys,
)


class NotificationReadStateServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.SessionLocal()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_upsert_is_idempotent(self) -> None:
        first = upsert_read_notification_keys(self.db, user_id="user-1", notification_keys=["audit:a", "message:b"])
        second = upsert_read_notification_keys(self.db, user_id="user-1", notification_keys=["audit:a", "message:b"])

        self.assertEqual(sorted(first), ["audit:a", "message:b"])
        self.assertEqual(sorted(second), ["audit:a", "message:b"])

    def test_upsert_merges_new_keys_without_duplicating_existing(self) -> None:
        upsert_read_notification_keys(self.db, user_id="user-1", notification_keys=["audit:a"])
        result = upsert_read_notification_keys(self.db, user_id="user-1", notification_keys=["audit:a", "delivery:c"])

        self.assertEqual(sorted(result), ["audit:a", "delivery:c"])

    def test_upsert_ignores_blank_keys(self) -> None:
        result = upsert_read_notification_keys(self.db, user_id="user-1", notification_keys=["", "  ", "audit:a"])

        self.assertEqual(result, ["audit:a"])

    def test_per_user_isolation(self) -> None:
        upsert_read_notification_keys(self.db, user_id="user-1", notification_keys=["audit:a"])
        upsert_read_notification_keys(self.db, user_id="user-2", notification_keys=["audit:b"])

        self.assertEqual(list_read_notification_keys(self.db, user_id="user-1"), ["audit:a"])
        self.assertEqual(list_read_notification_keys(self.db, user_id="user-2"), ["audit:b"])

    def test_list_empty_for_unknown_user(self) -> None:
        self.assertEqual(list_read_notification_keys(self.db, user_id="nobody"), [])


class _FakeUser:
    def __init__(self, user_id: str) -> None:
        self.id = user_id


class NotificationReadStateRouterTests(unittest.TestCase):
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
        self._current_user_id = "user-1"
        app.dependency_overrides[get_current_user] = lambda: _FakeUser(self._current_user_id)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.original_overrides)
        self.engine.dispose()

    def _override_get_db(self):
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def test_get_read_state_empty_by_default(self) -> None:
        response = self.client.get("/api/notifications/read-state")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"notification_keys": []})

    def test_post_then_get_round_trip(self) -> None:
        post_response = self.client.post(
            "/api/notifications/read-state",
            json={"notification_keys": ["audit:a", "telemetry:b"]},
        )
        self.assertEqual(post_response.status_code, 200)
        self.assertEqual(sorted(post_response.json()["notification_keys"]), ["audit:a", "telemetry:b"])

        get_response = self.client.get("/api/notifications/read-state")
        self.assertEqual(sorted(get_response.json()["notification_keys"]), ["audit:a", "telemetry:b"])

    def test_duplicate_post_is_idempotent(self) -> None:
        self.client.post("/api/notifications/read-state", json={"notification_keys": ["audit:a"]})
        response = self.client.post("/api/notifications/read-state", json={"notification_keys": ["audit:a"]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["notification_keys"], ["audit:a"])

    def test_read_state_is_scoped_per_user(self) -> None:
        self._current_user_id = "user-1"
        self.client.post("/api/notifications/read-state", json={"notification_keys": ["audit:a"]})

        self._current_user_id = "user-2"
        other_user_response = self.client.get("/api/notifications/read-state")

        self.assertEqual(other_user_response.json(), {"notification_keys": []})


if __name__ == "__main__":
    unittest.main()
