from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.services.execution_observability import emit_observability_event
from api.services.execution_pipeline import ExecutionContext
from api.services.telemetry_store import (
    InMemoryTelemetryStore,
    SqlAlchemyTelemetryStore,
    TelemetryQuery,
    TelemetryRecord,
    ensure_telemetry_storage,
)


class TelemetryStoreTests(unittest.TestCase):
    def test_record_creation_and_write(self) -> None:
        store = InMemoryTelemetryStore()
        record = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 6, 20, 10, 0, tzinfo=UTC),
            payload={"stage_count": 3},
            execution_id="exec-1",
            reminder_id="rem-1",
            schema_version="1.0.0",
        )

        written = store.write(record)

        self.assertEqual(written.event_id, record.event_id)
        self.assertEqual(written.event_type, "execution_started")
        self.assertEqual(written.schema_version, "1.0.0")

    def test_read_retrieves_written_record(self) -> None:
        store = InMemoryTelemetryStore()
        record = TelemetryRecord.create(event_type="execution_completed", execution_id="exec-2")
        store.write(record)

        found = store.read(record.event_id)

        self.assertIsNotNone(found)
        self.assertEqual(found.event_id, record.event_id)
        self.assertEqual(found.execution_id, "exec-2")

    def test_query_filters_by_type_and_execution(self) -> None:
        store = InMemoryTelemetryStore()
        keep = TelemetryRecord.create(
            event_type="retry_evaluated",
            category="retry",
            execution_id="exec-3",
            occurred_at=datetime(2026, 6, 20, 11, 0, tzinfo=UTC),
        )
        drop = TelemetryRecord.create(
            event_type="circuit_evaluated",
            category="circuit",
            execution_id="exec-4",
            occurred_at=datetime(2026, 6, 20, 12, 0, tzinfo=UTC),
        )
        store.write(keep)
        store.write(drop)

        results = store.query(TelemetryQuery(event_types={"retry_evaluated"}, execution_id="exec-3"))

        self.assertEqual([r.event_id for r in results], [keep.event_id])

    def test_retention_operation_deletes_expired_records(self) -> None:
        store = InMemoryTelemetryStore()
        old_record = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
        )
        new_record = TelemetryRecord.create(
            event_type="execution_completed",
            occurred_at=datetime(2026, 6, 20, 0, 0, tzinfo=UTC),
        )
        store.write(old_record)
        store.write(new_record)

        deleted = store.apply_retention(
            now=datetime(2026, 6, 20, 0, 0, tzinfo=UTC),
            retain_for=timedelta(days=90),
        )

        self.assertEqual(deleted, 1)
        self.assertIsNone(store.read(old_record.event_id))
        self.assertIsNotNone(store.read(new_record.event_id))

    def test_failure_scenario_duplicate_write_is_rejected(self) -> None:
        store = InMemoryTelemetryStore()
        record = TelemetryRecord.create(event_type="execution_started", event_id="dup-1")
        store.write(record)

        with self.assertRaises(ValueError):
            store.write(record)

    def test_backward_compatibility_assumption_legacy_schema_version_is_readable(self) -> None:
        store = InMemoryTelemetryStore()
        legacy = TelemetryRecord.create(
            event_type="execution_started",
            schema_version="0.9.0",
            payload={"legacy": True},
        )
        store.write(legacy)

        results = store.query(TelemetryQuery(event_types={"execution_started"}))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].schema_version, "0.9.0")
        self.assertTrue(results[0].payload.get("legacy"))


class SqlAlchemyTelemetryStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        ensure_telemetry_storage(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

    def tearDown(self) -> None:
        self.engine.dispose()

    def _store(self) -> SqlAlchemyTelemetryStore:
        return SqlAlchemyTelemetryStore(session_factory=self.SessionLocal)

    def test_sqlalchemy_store_write_read_query_delete(self) -> None:
        store = self._store()
        record = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 6, 20, 13, 0, tzinfo=UTC),
            execution_id="exec-sql-1",
            reminder_id="rem-sql-1",
            provider_name="email.noop",
            channel="email",
            payload={"stage_count": 1},
        )

        store.write(record)
        fetched = store.read(record.event_id)
        queried = store.query(TelemetryQuery(execution_id="exec-sql-1"))
        deleted = store.delete(record.event_id)

        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.event_id, record.event_id)
        self.assertEqual(len(queried), 1)
        self.assertEqual(queried[0].event_id, record.event_id)
        self.assertTrue(deleted)
        self.assertIsNone(store.read(record.event_id))

    def test_sqlalchemy_store_apply_retention(self) -> None:
        store = self._store()
        old_record = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
        )
        recent_record = TelemetryRecord.create(
            event_type="execution_completed",
            occurred_at=datetime(2026, 6, 20, 0, 0, tzinfo=UTC),
        )
        store.write(old_record)
        store.write(recent_record)

        deleted = store.apply_retention(
            now=datetime(2026, 6, 20, 0, 0, tzinfo=UTC),
            retain_for=timedelta(days=120),
        )

        self.assertEqual(deleted, 1)
        self.assertIsNone(store.read(old_record.event_id))
        self.assertIsNotNone(store.read(recent_record.event_id))

    def test_end_to_end_observer_to_sqlalchemy_store_persistence(self) -> None:
        store = self._store()
        context = ExecutionContext(
            execution_id="exec-sql-obs",
            reminder_id="rem-sql-obs",
            provider_name="email.noop",
            channel="email",
            execution_state="running",
            metadata={"telemetry_store": store},
        )

        emit_observability_event(context, "execution_started", payload={"stage_count": 2})

        results = store.query(TelemetryQuery(event_types={"execution_started"}, execution_id="exec-sql-obs"))
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].reminder_id, "rem-sql-obs")
        self.assertEqual(results[0].provider_name, "email.noop")
        self.assertEqual(results[0].payload.get("stage_count"), 2)


if __name__ == "__main__":
    unittest.main()
