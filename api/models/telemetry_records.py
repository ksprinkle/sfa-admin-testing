import uuid

from sqlalchemy import Column, DateTime, JSON, String
from sqlalchemy.sql import func

from api.db.base import Base


class TelemetryRecordModel(Base):
    __tablename__ = "telemetry_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(String, nullable=False, index=True)
    category = Column(String, nullable=True, index=True)
    occurred_at = Column(DateTime, nullable=False, index=True)
    schema_version = Column(String, nullable=False, default="1.0.0")

    correlation_id = Column(String, nullable=True, index=True)
    execution_id = Column(String, nullable=True, index=True)
    reminder_id = Column(String, nullable=True, index=True)
    provider_name = Column(String, nullable=True, index=True)
    channel = Column(String, nullable=True, index=True)

    payload = Column(JSON, nullable=True)
    tags = Column(JSON, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
