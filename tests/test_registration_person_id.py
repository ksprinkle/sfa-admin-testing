from __future__ import annotations

import unittest
import uuid
from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.db.base import Base
from api.models.events import Event
from api.models.person import Person
from api.models.users import User
from api.schemas.participants import PublicEventRegister
from api.services.authorization import ROLE_ADMIN, ROLE_PARTICIPANT
from api.services.public_registration import register_public_participant


class RegistrationPersonIdTests(unittest.TestCase):
    """
    Phase 3B Slice B7 Part 1c - register_public_participant() sets
    Participant.person_id alongside Participant.user_id, for the same
    population it already links (an authenticated participant-role
    caller) and only for that population.
    """

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            future=True,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = SessionLocal()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _make_event(self) -> Event:
        event = Event(
            title="Person ID Registration Event",
            slug="person-id-reg-" + uuid.uuid4().hex[:8],
            event_type="surf",
            status="published",
            start_date=date.today() + timedelta(days=20),
            end_date=date.today() + timedelta(days=20),
            participant_open=True,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def _make_user(self, *, role: str, with_person: bool) -> User:
        user = User(id=str(uuid.uuid4()), email=f"{uuid.uuid4()}@example.com", hashed_password="x", role=role)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        if with_person:
            person = Person(email=user.email, user_id=user.id)
            self.db.add(person)
            self.db.commit()
        return user

    def _payload(self, email: str) -> PublicEventRegister:
        return PublicEventRegister(first_name="Test", last_name="Registrant", email=email)

    def test_authenticated_participant_with_person_gets_person_id_set(self) -> None:
        event = self._make_event()
        user = self._make_user(role=ROLE_PARTICIPANT, with_person=True)
        person = self.db.query(Person).filter(Person.user_id == user.id).first()

        participant = register_public_participant(
            self.db, event.slug, self._payload("linked@example.com"), current_user=user
        )
        self.db.commit()

        self.assertEqual(participant.user_id, user.id)
        self.assertEqual(participant.person_id, person.id)

    def test_anonymous_registration_leaves_person_id_null(self) -> None:
        event = self._make_event()

        participant = register_public_participant(
            self.db, event.slug, self._payload("anon@example.com"), current_user=None
        )
        self.db.commit()

        self.assertIsNone(participant.user_id)
        self.assertIsNone(participant.person_id)

    def test_admin_caller_leaves_person_id_null(self) -> None:
        event = self._make_event()
        admin_user = self._make_user(role=ROLE_ADMIN, with_person=True)

        participant = register_public_participant(
            self.db, event.slug, self._payload("admin-caller@example.com"), current_user=admin_user
        )
        self.db.commit()

        self.assertIsNone(participant.user_id)
        self.assertIsNone(participant.person_id)

    def test_participant_without_person_yet_leaves_person_id_null_but_still_sets_user_id(self) -> None:
        # Edge case: a User created without ever going through registration's
        # Person-creation step (e.g. a pre-Slice-B7 gap-window account not
        # yet backfilled). user_id must still be set - only person_id is
        # affected by the missing Person.
        event = self._make_event()
        user = self._make_user(role=ROLE_PARTICIPANT, with_person=False)

        participant = register_public_participant(
            self.db, event.slug, self._payload("no-person-yet@example.com"), current_user=user
        )
        self.db.commit()

        self.assertEqual(participant.user_id, user.id)
        self.assertIsNone(participant.person_id)


if __name__ == "__main__":
    unittest.main()
