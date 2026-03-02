from pyclbr import Class
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional
from uuid import UUID

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