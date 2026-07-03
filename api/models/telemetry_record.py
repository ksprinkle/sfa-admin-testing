import uuid

from sqlalchemy import Column, DateTime, JSON, String
from sqlalchemy.sql import func

from api.db.base import Base


class TelemetryRecordModel(Base):
    __tablename__ = "telemetry_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    correlation_id = Column(String, nullable=True, index=True)
    payload_json = Column(JSON, nullable=True)
    schema_version = Column(String, nullable=False, default="1.0.0")
