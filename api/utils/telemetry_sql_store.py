from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Callable

from sqlalchemy import and_, delete, insert, select
from sqlalchemy.orm import Session

from api.services.telemetry_store import (
    TELEMETRY_RECORDS_TABLE,
    TelemetryQuery,
    TelemetryRecord,
    TelemetryStore,
    ensure_telemetry_storage,
)


def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class SqlTelemetryStore(TelemetryStore):
    def __init__(
        self,
        session_factory: Callable[[], Session],
        *,
        close_session_after_use: bool = True,
    ):
        self._session_factory = session_factory
        self._close_session_after_use = close_session_after_use

    def _acquire_session(self) -> Session:
        return self._session_factory()

    def _release_session(self, session: Session) -> None:
        if self._close_session_after_use:
            session.close()

    def _ensure_storage(self, session: Session) -> None:
        bind = session.get_bind()
        if bind is not None:
            ensure_telemetry_storage(bind)

    def _row_to_record(self, row: dict[str, Any]) -> TelemetryRecord:
        return TelemetryRecord(
            event_id=row["id"],
            event_type=row["event_type"],
            occurred_at=_normalize_dt(row["occurred_at"]),
            payload=dict(row.get("payload") or {}),
            schema_version=row.get("schema_version") or "1.0.0",
            category=row.get("category"),
            correlation_id=row.get("correlation_id"),
            execution_id=row.get("execution_id"),
            reminder_id=row.get("reminder_id"),
            provider_name=row.get("provider_name"),
            channel=row.get("channel"),
            tags={str(k): str(v) for k, v in (row.get("tags") or {}).items()},
        )

    # Requested API
    def write(self, record: TelemetryRecord) -> TelemetryRecord:
        session = self._acquire_session()
        try:
            self._ensure_storage(session)

            exists_stmt = select(TELEMETRY_RECORDS_TABLE.c.id).where(
                TELEMETRY_RECORDS_TABLE.c.id == record.event_id
            )
            if session.execute(exists_stmt).first() is not None:
                raise ValueError(f"Telemetry record already exists: {record.event_id}")

            stmt = insert(TELEMETRY_RECORDS_TABLE).values(
                id=record.event_id,
                event_type=record.event_type,
                category=record.category,
                occurred_at=_normalize_dt(record.occurred_at).replace(tzinfo=None),
                schema_version=record.schema_version,
                correlation_id=record.correlation_id,
                execution_id=record.execution_id,
                reminder_id=record.reminder_id,
                provider_name=record.provider_name,
                channel=record.channel,
                payload=record.payload,
                tags=record.tags,
                created_at=datetime.now(UTC).replace(tzinfo=None),
            )
            session.execute(stmt)
            session.commit()
            return record
        finally:
            self._release_session(session)

    def get(self, record_id: str) -> TelemetryRecord | None:
        session = self._acquire_session()
        try:
            self._ensure_storage(session)
            stmt = select(TELEMETRY_RECORDS_TABLE).where(TELEMETRY_RECORDS_TABLE.c.id == record_id)
            row = session.execute(stmt).mappings().first()
            if row is None:
                return None
            return self._row_to_record(dict(row))
        finally:
            self._release_session(session)

    def query(self, filters: TelemetryQuery | dict[str, Any] | None = None, limit: int = 100) -> list[TelemetryRecord]:
        session = self._acquire_session()
        try:
            self._ensure_storage(session)
            stmt = select(TELEMETRY_RECORDS_TABLE)

            conditions = []
            if isinstance(filters, TelemetryQuery):
                if filters.event_types:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.event_type.in_({e.strip() for e in filters.event_types}))
                if filters.category:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.category == filters.category.strip().lower())
                if filters.execution_id:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.execution_id == filters.execution_id)
                if filters.reminder_id:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.reminder_id == filters.reminder_id)
                if filters.provider_name:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.provider_name == filters.provider_name.strip().lower())
                if filters.channel:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.channel == filters.channel.strip().lower())
                if filters.correlation_id:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.correlation_id == filters.correlation_id)
                if filters.occurred_after:
                    conditions.append(
                        TELEMETRY_RECORDS_TABLE.c.occurred_at >= _normalize_dt(filters.occurred_after).replace(tzinfo=None)
                    )
                if filters.occurred_before:
                    conditions.append(
                        TELEMETRY_RECORDS_TABLE.c.occurred_at <= _normalize_dt(filters.occurred_before).replace(tzinfo=None)
                    )
            elif isinstance(filters, dict):
                if filters.get("event_type"):
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.event_type == str(filters["event_type"]).strip())
                if filters.get("category"):
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.category == str(filters["category"]).strip().lower())
                if filters.get("execution_id"):
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.execution_id == str(filters["execution_id"]))
                if filters.get("reminder_id"):
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.reminder_id == str(filters["reminder_id"]))
                if filters.get("provider_name"):
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.provider_name == str(filters["provider_name"]).strip().lower())
                if filters.get("channel"):
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.channel == str(filters["channel"]).strip().lower())
                if filters.get("correlation_id"):
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.correlation_id == str(filters["correlation_id"]))

            if conditions:
                stmt = stmt.where(and_(*conditions))

            stmt = stmt.order_by(TELEMETRY_RECORDS_TABLE.c.occurred_at.asc(), TELEMETRY_RECORDS_TABLE.c.id.asc())
            stmt = stmt.limit(max(1, int(limit)))
            rows = session.execute(stmt).mappings().all()
            return [self._row_to_record(dict(row)) for row in rows]
        finally:
            self._release_session(session)

    def delete_before(self, cutoff: datetime) -> int:
        session = self._acquire_session()
        try:
            self._ensure_storage(session)
            cutoff_naive = _normalize_dt(cutoff).replace(tzinfo=None)
            stmt = delete(TELEMETRY_RECORDS_TABLE).where(TELEMETRY_RECORDS_TABLE.c.occurred_at < cutoff_naive)
            result = session.execute(stmt)
            session.commit()
            return int(result.rowcount or 0)
        finally:
            self._release_session(session)

    # TelemetryStore contract compatibility
    def read(self, event_id: str) -> TelemetryRecord | None:
        return self.get(event_id)

    def delete(self, event_id: str) -> bool:
        session = self._acquire_session()
        try:
            self._ensure_storage(session)
            stmt = delete(TELEMETRY_RECORDS_TABLE).where(TELEMETRY_RECORDS_TABLE.c.id == event_id)
            result = session.execute(stmt)
            session.commit()
            return bool(result.rowcount)
        finally:
            self._release_session(session)

    def apply_retention(self, *, now: datetime | None = None, retain_for: timedelta) -> int:
        if retain_for.total_seconds() < 0:
            raise ValueError("retain_for must be non-negative")
        reference = _normalize_dt(now or datetime.now(UTC))
        cutoff = reference - retain_for
        return self.delete_before(cutoff)
