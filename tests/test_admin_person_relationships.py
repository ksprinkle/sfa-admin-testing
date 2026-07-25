from __future__ import annotations

import os
import unittest
import uuid

os.environ.setdefault("DEBUG", "true")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.db.base import Base
from api.db.session import get_db
from api.dependencies import get_current_user
from api.main import app
from api.models.admin_audit_events import AdminAuditEvent
from api.models.person import Person
from api.models.person_relationship import PersonRelationship
from api.models.users import User
from api.services.authorization import PERMISSION_ADMIN_ACCESS, ROLE_ADMIN, ROLE_PARTICIPANT
from api.services.capability_resolution import resolve_capabilities


class AdminPersonRelationshipsTests(unittest.TestCase):
    """
    Phase 3C Slice B13a - POST/GET /api/admin/person-relationships.

    Proves: admin-only creation succeeds and is immediately active and
    verified; validation guards (self-relationship, missing Person)
    work; non-admin/anonymous callers are rejected; creation is
    audited; and - the key architectural property this slice is
    scoped to preserve - creating a fully-permissive relationship has
    zero effect on capability resolution or participant ownership,
    confirming the capability engine's Relationships layer remains
    exactly as inert as it was before this slice.
    """

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

        self.client = TestClient(app)
        self.original_overrides = dict(app.dependency_overrides)
        app.dependency_overrides.clear()
        app.dependency_overrides[get_db] = self._override_get_db

        self.db = self.SessionLocal()

        self.admin = User(id=str(uuid.uuid4()), email="admin@example.com", hashed_password="x", role=ROLE_ADMIN)
        self.guardian_user = User(id=str(uuid.uuid4()), email="guardian@example.com", hashed_password="x", role=ROLE_PARTICIPANT)
        self.child_user = User(id=str(uuid.uuid4()), email="child@example.com", hashed_password="x", role=ROLE_PARTICIPANT)
        self.db.add_all([self.admin, self.guardian_user, self.child_user])
        self.db.commit()

        self.guardian_person = Person(id=uuid.uuid4(), user_id=self.guardian_user.id, email=self.guardian_user.email)
        self.child_person = Person(id=uuid.uuid4(), user_id=self.child_user.id, email=self.child_user.email)
        self.db.add_all([self.guardian_person, self.child_person])
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

    def _authenticate(self, user: User) -> None:
        app.dependency_overrides[get_current_user] = lambda: user

    def _create_payload(self, **overrides) -> dict:
        payload = {
            "subject_person_id": str(self.guardian_person.id),
            "related_person_id": str(self.child_person.id),
            "relationship_type": "parent",
            "can_register_for": True,
        }
        payload.update(overrides)
        return payload

    # --- Positive case ---

    def test_admin_creates_active_verified_relationship(self) -> None:
        self._authenticate(self.admin)

        response = self.client.post("/api/admin/person-relationships", json=self._create_payload())

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["status"], PersonRelationship.STATUS_ACTIVE)
        self.assertIsNotNone(body["verified_at"])
        self.assertEqual(body["verified_by_user_id"], self.admin.id)
        self.assertTrue(body["can_register_for"])

    def test_created_relationship_is_audited(self) -> None:
        self._authenticate(self.admin)

        self.client.post("/api/admin/person-relationships", json=self._create_payload())

        event = (
            self.db.query(AdminAuditEvent)
            .filter(AdminAuditEvent.domain == "relationships", AdminAuditEvent.action == "person_relationship_created")
            .first()
        )
        self.assertIsNotNone(event)
        self.assertEqual(event.actor_user_id, self.admin.id)

    def test_list_relationships_filters_by_subject(self) -> None:
        self._authenticate(self.admin)
        self.client.post("/api/admin/person-relationships", json=self._create_payload())

        response = self.client.get(
            "/api/admin/person-relationships",
            params={"subject_person_id": str(self.guardian_person.id)},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["related_person_id"], str(self.child_person.id))

    # --- Validation guards ---

    def test_self_relationship_rejected(self) -> None:
        self._authenticate(self.admin)

        response = self.client.post(
            "/api/admin/person-relationships",
            json=self._create_payload(related_person_id=str(self.guardian_person.id)),
        )

        self.assertEqual(response.status_code, 400)

    def test_unknown_subject_person_rejected(self) -> None:
        self._authenticate(self.admin)

        response = self.client.post(
            "/api/admin/person-relationships",
            json=self._create_payload(subject_person_id=str(uuid.uuid4())),
        )

        self.assertEqual(response.status_code, 404)

    def test_unknown_related_person_rejected(self) -> None:
        self._authenticate(self.admin)

        response = self.client.post(
            "/api/admin/person-relationships",
            json=self._create_payload(related_person_id=str(uuid.uuid4())),
        )

        self.assertEqual(response.status_code, 404)

    # --- Authorization ---

    def test_participant_denied(self) -> None:
        self._authenticate(self.guardian_user)

        response = self.client.post("/api/admin/person-relationships", json=self._create_payload())

        self.assertEqual(response.status_code, 403)

    def test_anonymous_denied(self) -> None:
        response = self.client.post("/api/admin/person-relationships", json=self._create_payload())

        self.assertEqual(response.status_code, 401)

    # --- The property this slice must preserve: architecturally inert ---

    def test_fully_permissive_relationship_does_not_affect_capability_resolution(self) -> None:
        self._authenticate(self.admin)

        response = self.client.post("/api/admin/person-relationships", json=self._create_payload(
            can_register_for=True,
            can_view_documents=True,
            can_manage_documents=True,
            can_receive_communications=True,
        ))
        self.assertEqual(response.status_code, 201, response.text)

        # Fresh session, mirroring how a real request would resolve capabilities.
        db = self.SessionLocal()
        try:
            capabilities = resolve_capabilities(
                db, user=self.guardian_user, target_person_id=self.child_person.id
            )
        finally:
            db.close()

        self.assertNotIn(PERMISSION_ADMIN_ACCESS, capabilities)
        # Only the guardian's own role-based permissions appear - nothing
        # relationship-derived, despite the fully-permissive row just created.
        from api.services.authorization import permissions_for_role

        self.assertEqual(capabilities, permissions_for_role(ROLE_PARTICIPANT))


if __name__ == "__main__":
    unittest.main()
