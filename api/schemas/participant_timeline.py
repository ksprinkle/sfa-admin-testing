from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class ParticipantTimelineEventType(str, Enum):
    REGISTRATION_CREATED = "REGISTRATION_CREATED"
    WAIVER_TEMPLATE_ASSIGNED = "WAIVER_TEMPLATE_ASSIGNED"
    WAIVER_SIGNED = "WAIVER_SIGNED"
    PDF_GENERATED = "PDF_GENERATED"
    PDF_VERIFIED = "PDF_VERIFIED"
    CHECKIN_COMPLETED = "CHECKIN_COMPLETED"


class ParticipantTimelineEventOut(BaseModel):
    event_id: str
    participant_id: UUID
    event_type: ParticipantTimelineEventType
    event_timestamp: datetime
    source_system: str
    display_title: str
    display_details: str | None = None
    reference_id: str | None = None
    sort_key: str
