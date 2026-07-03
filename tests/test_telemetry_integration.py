from __future__ import annotations

import unittest
from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.services.execution_observability import emit_observability_event
from api.services.execution_pipeline import ExecutionContext
from api.services.telemetry_store import TelemetryQuery, TelemetryRecord
from api.utils.telemetry_sql_store import SqlTelemetryStore


class TelemetryIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.store = SqlTelemetryStore(session_factory=self.SessionLocal)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_multiple_telemetry_writes(self) -> None:
        record_one = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 7, 1, 9, 0, tzinfo=UTC),
            execution_id="exec-multi-1",
        )
        record_two = TelemetryRecord.create(
            event_type="execution_completed",
            occurred_at=datetime(2026, 7, 1, 9, 5, tzinfo=UTC),
            execution_id="exec-multi-1",
        )

        self.store.write(record_one)
        self.store.write(record_two)

        results = self.store.query(TelemetryQuery(execution_id="exec-multi-1"))
        self.assertEqual(len(results), 2)
        self.assertEqual([item.event_type for item in results], ["execution_started", "execution_completed"])

    def test_query_by_correlation_id(self) -> None:
        keep = TelemetryRecord.create(
            event_type="retry_evaluated",
            occurred_at=datetime(2026, 7, 1, 10, 0, tzinfo=UTC),
            correlation_id="corr-keep-1",
        )
        drop = TelemetryRecord.create(
            event_type="retry_executed",
            occurred_at=datetime(2026, 7, 1, 10, 1, tzinfo=UTC),
            correlation_id="corr-drop-1",
        )
        self.store.write(keep)
        self.store.write(drop)

        results = self.store.query(TelemetryQuery(correlation_id="corr-keep-1"))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].event_id, keep.event_id)
        self.assertEqual(results[0].correlation_id, "corr-keep-1")

    def test_schema_version_is_persisted(self) -> None:
        record = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 7, 1, 11, 0, tzinfo=UTC),
            schema_version="2.1.0",
            execution_id="exec-schema-1",
        )

        self.store.write(record)
        fetched = self.store.get(record.event_id)

        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.schema_version, "2.1.0")

    def test_retention_deletes_records_before_cutoff(self) -> None:
        old_record = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
            execution_id="exec-retention-1",
        )
        recent_record = TelemetryRecord.create(
            event_type="execution_completed",
            occurred_at=datetime(2026, 7, 1, 0, 0, tzinfo=UTC),
            execution_id="exec-retention-1",
        )
        self.store.write(old_record)
        self.store.write(recent_record)

        deleted = self.store.delete_before(datetime(2026, 6, 1, 0, 0, tzinfo=UTC))

        self.assertEqual(deleted, 1)
        remaining = self.store.query(TelemetryQuery(execution_id="exec-retention-1"))
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0].event_id, recent_record.event_id)

    def test_observer_persists_events_across_execution_lifecycle(self) -> None:
        context = ExecutionContext(
            execution_id="exec-lifecycle-1",
            reminder_id="rem-lifecycle-1",
            provider_name="email.noop",
            channel="email",
            execution_state="running",
        )

        emit_observability_event(
            context,
            "execution_started",
            payload={"stage_count": 2},
            telemetry_store=self.store,
        )
        emit_observability_event(
            context,
            "outcome_classified",
            payload={"execution_outcome": "success"},
            telemetry_store=self.store,
        )
        emit_observability_event(
            context,
            "execution_completed",
            payload={"status": "success"},
            telemetry_store=self.store,
        )

        persisted = self.store.query(TelemetryQuery(execution_id="exec-lifecycle-1"))
        self.assertEqual(len(persisted), 3)
        self.assertEqual([item.event_type for item in persisted], [
            "execution_started",
            "outcome_classified",
            "execution_completed",
        ])


if __name__ == "__main__":
    unittest.main()
