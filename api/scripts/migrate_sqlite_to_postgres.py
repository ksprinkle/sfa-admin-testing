import os
import sys
import uuid
from typing import Any

from sqlalchemy import create_engine, func, inspect, select
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from api.db.base import Base
import api.models  # noqa: F401  # Ensure model tables are registered on Base.metadata


SQLITE_URL = "sqlite:///sfa.db"


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def coerce_uuid(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            if "-" in cleaned:
                return uuid.UUID(cleaned)
            return uuid.UUID(hex=cleaned)
        except ValueError as exc:
            raise ValueError(f"Invalid UUID string value: {value!r}") from exc

    raise TypeError(f"Unsupported UUID value type: {type(value).__name__} ({value!r})")


def normalize_row_for_target(table, row: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for column in table.columns:
        value = row.get(column.name)
        if isinstance(column.type, PG_UUID):
            normalized[column.name] = coerce_uuid(value)
        else:
            normalized[column.name] = value
    return normalized


def table_row_count(conn, table) -> int:
    count = conn.scalar(select(func.count()).select_from(table))
    return int(count or 0)


def copy_table(sqlite_conn, postgres_conn, table) -> tuple[str, int]:
    source_count = table_row_count(sqlite_conn, table)
    target_count = table_row_count(postgres_conn, table)

    print(f"\n[{table.name}] source={source_count}, target={target_count}")

    if source_count == 0:
        print(f"[{table.name}] skipped (no source rows)")
        return "skipped-empty-source", 0

    if target_count > 0:
        print(f"[{table.name}] skipped (target already has data)")
        return "skipped-target-not-empty", 0

    rows = sqlite_conn.execute(select(table)).mappings().all()
    payload = [normalize_row_for_target(table, dict(row)) for row in rows]

    if payload:
        postgres_conn.execute(table.insert(), payload)

    print(f"[{table.name}] copied {len(payload)} rows")
    return "copied", len(payload)


def main() -> int:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is not set.")
        return 1

    postgres_url = normalize_database_url(database_url)

    print("Starting SQLite -> PostgreSQL migration")
    print(f"SQLite URL: {SQLITE_URL}")
    print("PostgreSQL URL: DATABASE_URL from environment")

    sqlite_engine = create_engine(SQLITE_URL, future=True)
    postgres_engine = create_engine(postgres_url, future=True)

    tables = list(Base.metadata.sorted_tables)
    if not tables:
        print("No tables found in Base.metadata. Nothing to migrate.")
        return 0

    sqlite_table_names = set(inspect(sqlite_engine).get_table_names())
    postgres_table_names = set(inspect(postgres_engine).get_table_names())

    copied_tables = 0
    copied_rows = 0
    skipped_tables = 0

    with sqlite_engine.connect() as sqlite_conn:
        for table in tables:
            if table.name not in sqlite_table_names:
                print(f"Skipping table: {table.name} (not found in SQLite)")
                skipped_tables += 1
                continue

            if table.name not in postgres_table_names:
                print(f"\n[{table.name}] skipped (table does not exist in PostgreSQL)")
                skipped_tables += 1
                continue

            try:
                with postgres_engine.begin() as postgres_conn:
                    status, row_count = copy_table(sqlite_conn, postgres_conn, table)
                if status == "copied":
                    copied_tables += 1
                    copied_rows += row_count
                else:
                    skipped_tables += 1
            except Exception as exc:
                print(f"\n[{table.name}] ERROR: {exc}")
                print("Aborting migration to keep data consistent.")
                return 1

    print("\nMigration complete.")
    print(f"Tables copied: {copied_tables}")
    print(f"Rows copied: {copied_rows}")
    print(f"Tables skipped: {skipped_tables}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
