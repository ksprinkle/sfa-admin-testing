from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class EventOperationsTimelineEntryType(str, Enum):
    PARTICIPANT_CHECK_IN = "PARTICIPANT_CHECK_IN"
    VOLUNTEER_CHECK_IN = "VOLUNTEER_CHECK_IN"
    SESSION_ASSIGNMENT = "SESSION_ASSIGNMENT"
    WAITLIST_PROMOTION = "WAITLIST_PROMOTION"
    WAIVER_VERIFICATION = "WAIVER_VERIFICATION"


class EventOperationsTimelineEntryOut(BaseModel):
    entry_id: str
    entry_type: EventOperationsTimelineEntryType
    occurred_at: datetime
    icon: str
    title: str
    description: str
    reference_id: str | None = None


class EventOperationsTimelineOut(BaseModel):
    event_id: str
    entries: list[EventOperationsTimelineEntryOut]
