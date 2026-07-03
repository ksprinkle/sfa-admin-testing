from __future__ import annotations

import os
import unittest
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DEBUG", "true")

from api.db.base import Base
from api.db.session import get_db
from api.dependencies import require_admin
from api.main import app
from api.routers.admin_dashboard import _build_dashboard_registry
from api.services.telemetry_store import SqlAlchemyTelemetryStore, TelemetryRecord, ensure_telemetry_storage


class AdminDashboardRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            future=True,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        ensure_telemetry_storage(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

        self.store = SqlAlchemyTelemetryStore(self.SessionLocal, close_session_after_use=True)

        self.client = TestClient(app)
        self.original_overrides = dict(app.dependency_overrides)
        app.dependency_overrides.clear()
        app.dependency_overrides[require_admin] = lambda: object()
        app.dependency_overrides[get_db] = self._override_get_db

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

    def _seed_records(self) -> None:
        records = [
            TelemetryRecord.create(
                event_type="execution_started",
                occurred_at=datetime(2026, 7, 3, 10, 0, tzinfo=UTC),
                category="execution",
                execution_id="exec-1",
                provider_name="email.noop",
                channel="email",
                payload={"status": "success"},
            ),
            TelemetryRecord.create(
                event_type="execution_failed",
                occurred_at=datetime(2026, 7, 3, 11, 0, tzinfo=UTC),
                category="execution",
                execution_id="exec-2",
                provider_name="email.noop",
                channel="email",
                payload={"status": "failed"},
            ),
            TelemetryRecord.create(
                event_type="retry_evaluated",
                occurred_at=datetime(2026, 7, 3, 12, 0, tzinfo=UTC),
                category="retry",
                execution_id="exec-3",
                provider_name="email.smtp",
                channel="email",
                tags={"status": "pending"},
            ),
        ]
        for record in records:
            self.store.write(record)

    def test_dashboard_overview_endpoint_returns_read_only_presentation_data(self) -> None:
        self._seed_records()

        response = self.client.get("/api/admin/dashboard/overview")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["dashboard_key"], "operational_dashboard")
        self.assertTrue(payload["read_only"])
        self.assertEqual(payload["summary"]["telemetry_total"], 3)
        self.assertEqual(payload["summary"]["widget_count"], 6)
        self.assertEqual(payload["metric_values"]["telemetry.total"], 3)
        self.assertEqual(payload["metric_values"]["status.failed"], 1)

    def test_dashboard_metrics_endpoint_returns_aggregated_snapshot(self) -> None:
        self._seed_records()

        response = self.client.get("/api/admin/dashboard/metrics?recent_activity_limit=2")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["total_events"], 3)
        self.assertEqual(payload["event_type_counts"]["execution_started"], 1)
        self.assertEqual(len(payload["recent_activity"]), 2)
        self.assertEqual(payload["recent_activity"][0]["event_id"], self.store.query()[2].event_id)

    def test_dashboard_diagnostics_endpoint_returns_health_summary_and_report(self) -> None:
        self._seed_records()

        summary_response = self.client.get("/api/admin/dashboard/diagnostics/summary")
        report_response = self.client.get("/api/admin/dashboard/diagnostics/report?recent_activity_limit=2")

        self.assertEqual(summary_response.status_code, 200)
        self.assertEqual(report_response.status_code, 200)

        summary_payload = summary_response.json()
        report_payload = report_response.json()

        self.assertEqual(summary_payload["overall_status"], "degraded")
        self.assertEqual(summary_payload["failure_count"], 1)
        self.assertEqual(report_payload["health_summary"]["overall_status"], "degraded")
        self.assertEqual(report_payload["health_summary"]["failure_count"], 1)
        self.assertGreaterEqual(len(report_payload["findings"]), 1)


if __name__ == "__main__":
    unittest.main()
