from pyclbr import Class
from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from typing import Literal

class ParticipantCreate(BaseModel):
    event_id: UUID
    first_name: str
    last_name: str
    email: EmailStr
    role: str = "participant"
    is_minor: bool = False
    priority: int = 0

    class Config:
        from_attributes = True


class ParticipantOut(BaseModel):
    id: UUID
    event_id: UUID
    first_name: str
    last_name: str
    email: str
    role: str
    is_minor: bool
    is_waitlisted: bool
    priority: int
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
    first_name: str
    last_name: str
    email: str
    checked_in: bool
    is_waitlisted: bool
    waiver_verified: bool
    event_title: str | None

    model_config = ConfigDict(from_attributes=True)

class SessionUpdate(BaseModel):
    session_id: UUID