from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from api.config import settings

import os

DATABASE_URL = settings.DATABASE_URL

# Render may provide postgres://...; SQLAlchemy expects postgresql://...
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine_kwargs = {}
is_sqlite = DATABASE_URL.startswith("sqlite")
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)

# Log database type at startup
db_type = "SQLite (local development)" if is_sqlite else "PostgreSQL (production)"
print(f"✅ Database: {db_type}")
if is_sqlite:
    print(f"   Path: {DATABASE_URL}")
else:
    # Hide credentials in production logs
    redacted_url = DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "<hidden>"
    print(f"   Host: {redacted_url}")

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
