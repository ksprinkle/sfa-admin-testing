from pyclbr import Class
from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from typing import Literal

class ParticipantCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    role: str
    is_minor: bool = False


class ParticipantOut(BaseModel):
    id: UUID
    event_id: UUID
    first_name: str
    last_name: str
    email: str
    role: str
    is_minor: bool
    is_waitlisted: bool
    checked_in: bool
    checked_in_at: Optional[datetime]

class Config:
    from_attributes = True

class ParticipantAction(BaseModel):
    action: Literal[
        "checkin",
        "undo_checkin",
        "promote",
        "move_to_waitlist",
        "verify_waiver",
        "remove"
    ]
class AdminParticipantListOut(BaseModel):
    id: UUID
    event_id: UUID
    first_name: str
    last_name: str
    email: str
    role: str
    is_minor: bool
    is_waitlisted: bool
    checked_in: bool
    checked_in_at: datetime | None

    waiver_signed: bool
    waiver_verified: bool
    waiver_signed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)