from __future__ import annotations

import unittest
from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.services.telemetry_store import TelemetryQuery, TelemetryRecord
from api.utils.telemetry_sql_store import SqlTelemetryStore


class SqlTelemetryStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.store = SqlTelemetryStore(session_factory=self.SessionLocal)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_write_record(self) -> None:
        record = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 7, 1, 10, 0, tzinfo=UTC),
            execution_id="exec-write-1",
            payload={"stage_count": 1},
        )

        written = self.store.write(record)

        self.assertEqual(written.event_id, record.event_id)
        self.assertEqual(written.event_type, "execution_started")

    def test_get_record(self) -> None:
        record = TelemetryRecord.create(
            event_type="execution_completed",
            occurred_at=datetime(2026, 7, 1, 11, 0, tzinfo=UTC),
            execution_id="exec-get-1",
        )
        self.store.write(record)

        fetched = self.store.get(record.event_id)

        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.event_id, record.event_id)
        self.assertEqual(fetched.execution_id, "exec-get-1")

    def test_query_records(self) -> None:
        keep = TelemetryRecord.create(
            event_type="retry_evaluated",
            category="retry",
            occurred_at=datetime(2026, 7, 1, 12, 0, tzinfo=UTC),
            execution_id="exec-query-1",
        )
        drop = TelemetryRecord.create(
            event_type="circuit_evaluated",
            category="circuit",
            occurred_at=datetime(2026, 7, 1, 13, 0, tzinfo=UTC),
            execution_id="exec-query-2",
        )
        self.store.write(keep)
        self.store.write(drop)

        results = self.store.query(TelemetryQuery(event_types={"retry_evaluated"}))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].event_id, keep.event_id)

    def test_delete_before_retention_behavior(self) -> None:
        old_record = TelemetryRecord.create(
            event_type="execution_started",
            occurred_at=datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
        )
        recent_record = TelemetryRecord.create(
            event_type="execution_completed",
            occurred_at=datetime(2026, 7, 1, 0, 0, tzinfo=UTC),
        )
        self.store.write(old_record)
        self.store.write(recent_record)

        deleted_count = self.store.delete_before(datetime(2026, 6, 1, 0, 0, tzinfo=UTC))

        self.assertEqual(deleted_count, 1)
        self.assertIsNone(self.store.get(old_record.event_id))
        self.assertIsNotNone(self.store.get(recent_record.event_id))

    def test_empty_query_result(self) -> None:
        results = self.store.query(TelemetryQuery(event_types={"non_existent_event"}))

        self.assertEqual(results, [])


if __name__ == "__main__":
    unittest.main()
