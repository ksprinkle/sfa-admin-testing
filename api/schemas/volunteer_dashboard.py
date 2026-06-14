from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class VolunteerOperationalStatus(str, Enum):
    ACTION_REQUIRED = "ACTION_REQUIRED"
    INCOMPLETE = "INCOMPLETE"
    CHECKED_IN = "CHECKED_IN"
    READY = "READY"


class VolunteerDashboardVolunteerOut(BaseModel):
    participant_id: UUID
    full_name: str
    email: str
    event_id: UUID | None = None
    event_title: str | None = None
    event_type: str | None = None
    session_id: UUID | None = None
    session_name: str | None = None
    checked_in: bool
    waiver_verified: bool
    waiver_document_status: str
    compliance_status: str
    computed_status: VolunteerOperationalStatus
    status_reasons: list[str]
    sort_key: str


class VolunteerDashboardSummaryOut(BaseModel):
    total_volunteers: int
    action_required: int
    incomplete: int
    checked_in: int
    ready: int


class VolunteerDashboardProjectionOut(BaseModel):
    compliance_tracking_supported: bool
    summary: VolunteerDashboardSummaryOut
    volunteers: list[VolunteerDashboardVolunteerOut]
