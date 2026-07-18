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
from api.main import app
from api.models.events import Event
from api.models.participants import Participant
from api.models.waiver_audit_events import WaiverAuditEvent
from api.models.waiver_templates import WaiverTemplate


class PublicOnboardingWaiverIssuanceTests(unittest.TestCase):
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

    def _make_event(self, **overrides) -> Event:
        defaults = dict(
            title="Onboarding Test Event",
            slug="onboarding-" + uuid.uuid4().hex[:8],
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

    def _activate_template(self, content: str = "Full waiver text.") -> WaiverTemplate:
        template = WaiverTemplate(title="Test Waiver", version=1, status=WaiverTemplate.STATUS_ACTIVE, content=content)
        self.db.add(template)
        self.db.commit()
        self.db.refresh(template)
        return template

    # --- No active template: preserve prior (no-waiver) behavior ---

    def test_no_active_template_skips_waiver_issuance(self) -> None:
        event = self._make_event()

        response = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "No", "last_name": "Template", "email": "notpl@example.com"},
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertFalse(body["waiver"]["required"])
        self.assertIsNone(body["waiver"]["token"])
        self.assertIsNone(body["waiver"]["signing_path"])
        self.assertFalse(body["participant"]["is_waitlisted"])

    # --- Active template: token issued, correct template/version associated ---

    def test_active_template_issues_signing_token_with_correct_template(self) -> None:
        template = self._activate_template()
        event = self._make_event()

        response = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.com"},
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["waiver"]["required"])
        self.assertTrue(body["waiver"]["token"])
        self.assertEqual(body["waiver"]["signing_path"], f"/api/waivers/sign/{body['waiver']['token']}")

        sign_get = self.client.get(f"/api/waivers/sign/{body['waiver']['token']}")
        self.assertEqual(sign_get.status_code, 200)
        sign_body = sign_get.json()
        self.assertEqual(sign_body["status"], "ready")
        self.assertEqual(sign_body["waiver_template_content"], template.content)
        self.assertEqual(sign_body["waiver_template_version"], 1)

    # --- Full signing completes, audit trail unchanged in shape ---

    def test_full_signing_flow_completes_and_records_audit_trail(self) -> None:
        self._activate_template()
        event = self._make_event()

        register_response = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "Grace", "last_name": "Hopper", "email": "grace@example.com"},
        )
        token = register_response.json()["waiver"]["token"]

        # Mirror the real flow: the signer's browser loads the signing page
        # (GET) before submitting (POST) — this is what actually produces the
        # TOKEN_VIEWED event asserted below.
        self.client.get(f"/api/waivers/sign/{token}")

        sign_response = self.client.post(
            f"/api/waivers/sign/{token}", json={"accepted": True, "signer_name": "Grace Hopper"}
        )
        self.assertEqual(sign_response.status_code, 200)
        self.assertEqual(sign_response.json()["status"], "signed")

        participant_id = uuid.UUID(register_response.json()["participant"]["id"])
        participant = self.db.query(Participant).filter(Participant.id == participant_id).first()
        self.db.refresh(participant)
        self.assertTrue(participant.waiver_verified)
        self.assertTrue(participant.waiver_signed)

        audit_events = (
            self.db.query(WaiverAuditEvent)
            .filter(WaiverAuditEvent.waiver_id == participant.waiver.id)
            .order_by(WaiverAuditEvent.created_at.asc())
            .all()
        )
        self.assertEqual(
            [event.event_type for event in audit_events],
            ["TOKEN_CREATED", "TOKEN_VALIDATED", "TOKEN_VIEWED", "TOKEN_VALIDATED", "SIGN_SUBMITTED", "SIGN_COMPLETED"],
        )

    # --- Waitlisted registrations still get a waiver token ---

    def test_waitlisted_registration_still_issues_waiver_token(self) -> None:
        self._activate_template()
        event = self._make_event(participant_capacity=1)

        self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "First", "last_name": "One", "email": "first@example.com"},
        )
        second = self.client.post(
            f"/api/public/events/{event.slug}/register",
            json={"first_name": "Second", "last_name": "Waitlisted", "email": "second@example.com"},
        )

        self.assertEqual(second.status_code, 201)
        body = second.json()
        self.assertTrue(body["participant"]["is_waitlisted"])
        self.assertTrue(body["waiver"]["required"])
        self.assertTrue(body["waiver"]["token"])

    # --- Duplicate registrations still behave correctly ---

    def test_duplicate_registration_still_conflicts(self) -> None:
        self._activate_template()
        event = self._make_event()
        payload = {"first_name": "Dup", "last_name": "Licate", "email": "dup@example.com"}

        first = self.client.post(f"/api/public/events/{event.slug}/register", json=payload)
        self.assertEqual(first.status_code, 201)

        second = self.client.post(f"/api/public/events/{event.slug}/register", json=payload)
        self.assertEqual(second.status_code, 409)

    # --- Legacy endpoint: unchanged response shape, no waiver side effect ---

    def test_legacy_endpoint_response_shape_and_no_waiver_side_effect(self) -> None:
        self._activate_template()
        event = self._make_event()

        response = self.client.post(
            f"/api/events/{event.slug}/participants",
            json={
                "event_id": str(event.id),
                "first_name": "Legacy",
                "last_name": "Caller",
                "email": "legacy@example.com",
            },
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertNotIn("participant", body)
        self.assertNotIn("waiver", body)
        self.assertIn("is_waitlisted", body)

        participant_id = uuid.UUID(body["id"])
        participant = self.db.query(Participant).filter(Participant.id == participant_id).first()
        self.assertIsNone(participant.waiver)


if __name__ == "__main__":
    unittest.main()
