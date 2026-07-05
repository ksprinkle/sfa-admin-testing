from __future__ import annotations

import unittest
from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from api.models.events import Event
from api.models.users import User  # noqa: F401
from api.crud.events import auto_publish_and_open_participant_registration


class EventAutoPublishWindowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            future=True,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Event.__table__.create(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_chapter_event_outside_window_does_not_auto_publish(self) -> None:
        db = self.SessionLocal()
        try:
            start_date = date.today() + timedelta(days=20)
            event = Event(
                title="Chapter Event Outside Window",
                slug="chapter-event-outside-window",
                event_type="chapter",
                status="draft",
                start_date=start_date,
                participant_open=False,
            )
            db.add(event)
            db.commit()

            changed = auto_publish_and_open_participant_registration(db)
            db.refresh(event)

            self.assertFalse(changed)
            self.assertEqual(event.status, "draft")
            self.assertFalse(event.participant_open)
        finally:
            db.close()

    def test_chapter_event_inside_window_auto_publishes_and_opens_registration(self) -> None:
        db = self.SessionLocal()
        try:
            start_date = date.today() + timedelta(days=14)
            event = Event(
                title="Chapter Event Inside Window",
                slug="chapter-event-inside-window",
                event_type="chapter",
                status="draft",
                start_date=start_date,
                participant_open=False,
            )
            db.add(event)
            db.commit()

            changed = auto_publish_and_open_participant_registration(db)
            db.refresh(event)

            self.assertTrue(changed)
            self.assertEqual(event.status, "published")
            self.assertTrue(event.participant_open)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
