from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Callable
from uuid import uuid4

from sqlalchemy import JSON, Column, DateTime, MetaData, String, Table, and_, delete, insert, select
from sqlalchemy.engine import Engine, RowMapping
from sqlalchemy.orm import Session


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


_TELEMETRY_METADATA = MetaData()

TELEMETRY_RECORDS_TABLE = Table(
    "telemetry_records",
    _TELEMETRY_METADATA,
    Column("id", String, primary_key=True),
    Column("event_type", String, nullable=False, index=True),
    Column("category", String, nullable=True, index=True),
    Column("occurred_at", DateTime, nullable=False, index=True),
    Column("schema_version", String, nullable=False, default="1.0.0"),
    Column("correlation_id", String, nullable=True, index=True),
    Column("execution_id", String, nullable=True, index=True),
    Column("reminder_id", String, nullable=True, index=True),
    Column("provider_name", String, nullable=True, index=True),
    Column("channel", String, nullable=True, index=True),
    Column("payload", JSON, nullable=True),
    Column("tags", JSON, nullable=True),
    Column("created_at", DateTime, nullable=False),
)


def ensure_telemetry_storage(engine: Engine) -> None:
    _TELEMETRY_METADATA.create_all(bind=engine, tables=[TELEMETRY_RECORDS_TABLE])


@dataclass(frozen=True)
class TelemetryRecord:
    event_id: str
    event_type: str
    occurred_at: datetime
    payload: dict[str, Any] = field(default_factory=dict)
    schema_version: str = "1.0.0"
    category: str | None = None
    correlation_id: str | None = None
    execution_id: str | None = None
    reminder_id: str | None = None
    provider_name: str | None = None
    channel: str | None = None
    tags: dict[str, str] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        *,
        event_type: str,
        occurred_at: datetime | None = None,
        payload: dict[str, Any] | None = None,
        schema_version: str = "1.0.0",
        category: str | None = None,
        correlation_id: str | None = None,
        execution_id: str | None = None,
        reminder_id: str | None = None,
        provider_name: str | None = None,
        channel: str | None = None,
        tags: dict[str, str] | None = None,
        event_id: str | None = None,
    ) -> "TelemetryRecord":
        normalized_payload = dict(payload or {})
        return cls(
            event_id=event_id or str(uuid4()),
            event_type=event_type.strip(),
            occurred_at=_normalize_dt(occurred_at or _utc_now()),
            payload=normalized_payload,
            schema_version=schema_version.strip() or "1.0.0",
            category=(category or "").strip().lower() or None,
            correlation_id=(correlation_id or "").strip() or None,
            execution_id=(execution_id or "").strip() or None,
            reminder_id=(reminder_id or "").strip() or None,
            provider_name=(provider_name or "").strip().lower() or None,
            channel=(channel or "").strip().lower() or None,
            tags={str(k): str(v) for k, v in (tags or {}).items()},
        )


@dataclass(frozen=True)
class TelemetryQuery:
    event_types: set[str] | None = None
    category: str | None = None
    execution_id: str | None = None
    reminder_id: str | None = None
    provider_name: str | None = None
    channel: str | None = None
    occurred_after: datetime | None = None
    occurred_before: datetime | None = None
    correlation_id: str | None = None


class TelemetryStore(ABC):
    @abstractmethod
    def write(self, record: TelemetryRecord) -> TelemetryRecord:
        raise NotImplementedError

    @abstractmethod
    def read(self, event_id: str) -> TelemetryRecord | None:
        raise NotImplementedError

    @abstractmethod
    def query(self, query: TelemetryQuery | None = None) -> list[TelemetryRecord]:
        raise NotImplementedError

    @abstractmethod
    def delete(self, event_id: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def apply_retention(self, *, now: datetime | None = None, retain_for: timedelta) -> int:
        raise NotImplementedError


class InMemoryTelemetryStore(TelemetryStore):
    def __init__(self):
        self._records: dict[str, TelemetryRecord] = {}

    def write(self, record: TelemetryRecord) -> TelemetryRecord:
        if not record.event_id.strip():
            raise ValueError("TelemetryRecord.event_id is required")
        if record.event_id in self._records:
            raise ValueError(f"Telemetry record already exists: {record.event_id}")
        self._records[record.event_id] = record
        return record

    def read(self, event_id: str) -> TelemetryRecord | None:
        return self._records.get(event_id)

    def query(self, query: TelemetryQuery | None = None) -> list[TelemetryRecord]:
        items = list(self._records.values())
        if query is None:
            return sorted(items, key=lambda r: (r.occurred_at, r.event_id))

        after = _normalize_dt(query.occurred_after) if query.occurred_after else None
        before = _normalize_dt(query.occurred_before) if query.occurred_before else None
        event_types = {e.strip() for e in query.event_types} if query.event_types else None
        category = (query.category or "").strip().lower() or None
        provider_name = (query.provider_name or "").strip().lower() or None
        channel = (query.channel or "").strip().lower() or None

        filtered: list[TelemetryRecord] = []
        for item in items:
            if event_types and item.event_type not in event_types:
                continue
            if category and item.category != category:
                continue
            if query.execution_id and item.execution_id != query.execution_id:
                continue
            if query.reminder_id and item.reminder_id != query.reminder_id:
                continue
            if provider_name and item.provider_name != provider_name:
                continue
            if channel and item.channel != channel:
                continue
            if query.correlation_id and item.correlation_id != query.correlation_id:
                continue
            if after and item.occurred_at < after:
                continue
            if before and item.occurred_at > before:
                continue
            filtered.append(item)

        return sorted(filtered, key=lambda r: (r.occurred_at, r.event_id))

    def delete(self, event_id: str) -> bool:
        return self._records.pop(event_id, None) is not None

    def apply_retention(self, *, now: datetime | None = None, retain_for: timedelta) -> int:
        if retain_for.total_seconds() < 0:
            raise ValueError("retain_for must be non-negative")

        reference = _normalize_dt(now or _utc_now())
        cutoff = reference - retain_for

        to_delete = [event_id for event_id, record in self._records.items() if record.occurred_at < cutoff]
        for event_id in to_delete:
            del self._records[event_id]
        return len(to_delete)


class SqlAlchemyTelemetryStore(TelemetryStore):
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

    def _row_to_domain(self, row: RowMapping) -> TelemetryRecord:
        return TelemetryRecord(
            event_id=row["id"],
            event_type=row["event_type"],
            occurred_at=_normalize_dt(row["occurred_at"]),
            payload=dict(row["payload"] or {}),
            schema_version=row["schema_version"],
            category=row["category"],
            correlation_id=row["correlation_id"],
            execution_id=row["execution_id"],
            reminder_id=row["reminder_id"],
            provider_name=row["provider_name"],
            channel=row["channel"],
            tags={str(k): str(v) for k, v in (row["tags"] or {}).items()},
        )

    def write(self, record: TelemetryRecord) -> TelemetryRecord:
        session = self._acquire_session()
        try:
            self._ensure_storage(session)
            existing_stmt = select(TELEMETRY_RECORDS_TABLE.c.id).where(TELEMETRY_RECORDS_TABLE.c.id == record.event_id)
            if session.execute(existing_stmt).first() is not None:
                raise ValueError(f"Telemetry record already exists: {record.event_id}")

            insert_stmt = insert(TELEMETRY_RECORDS_TABLE).values(
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
                created_at=_utc_now().replace(tzinfo=None),
            )
            session.execute(insert_stmt)
            session.commit()
            return record
        finally:
            self._release_session(session)

    def read(self, event_id: str) -> TelemetryRecord | None:
        session = self._acquire_session()
        try:
            self._ensure_storage(session)
            stmt = select(TELEMETRY_RECORDS_TABLE).where(TELEMETRY_RECORDS_TABLE.c.id == event_id)
            row = session.execute(stmt).mappings().first()
            if row is None:
                return None
            return self._row_to_domain(row)
        finally:
            self._release_session(session)

    def query(self, query: TelemetryQuery | None = None) -> list[TelemetryRecord]:
        session = self._acquire_session()
        try:
            self._ensure_storage(session)
            stmt = select(TELEMETRY_RECORDS_TABLE)
            if query is not None:
                conditions = []
                if query.event_types:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.event_type.in_({e.strip() for e in query.event_types}))
                if query.category:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.category == query.category.strip().lower())
                if query.execution_id:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.execution_id == query.execution_id)
                if query.reminder_id:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.reminder_id == query.reminder_id)
                if query.provider_name:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.provider_name == query.provider_name.strip().lower())
                if query.channel:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.channel == query.channel.strip().lower())
                if query.correlation_id:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.correlation_id == query.correlation_id)
                if query.occurred_after:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.occurred_at >= _normalize_dt(query.occurred_after).replace(tzinfo=None))
                if query.occurred_before:
                    conditions.append(TELEMETRY_RECORDS_TABLE.c.occurred_at <= _normalize_dt(query.occurred_before).replace(tzinfo=None))
                if conditions:
                    stmt = stmt.where(and_(*conditions))

            stmt = stmt.order_by(TELEMETRY_RECORDS_TABLE.c.occurred_at.asc(), TELEMETRY_RECORDS_TABLE.c.id.asc())
            rows = session.execute(stmt).mappings().all()
            return [self._row_to_domain(row) for row in rows]
        finally:
            self._release_session(session)

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

        session = self._acquire_session()
        try:
            self._ensure_storage(session)
            reference = _normalize_dt(now or _utc_now()).replace(tzinfo=None)
            cutoff = reference - retain_for
            stmt = delete(TELEMETRY_RECORDS_TABLE).where(TELEMETRY_RECORDS_TABLE.c.occurred_at < cutoff)
            result = session.execute(stmt)
            session.commit()
            return int(result.rowcount or 0)
        finally:
            self._release_session(session)
